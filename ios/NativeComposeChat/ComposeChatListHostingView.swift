import SwiftUI
import UIKit

@objc protocol ComposeChatListViewDelegate: AnyObject {
  func composeChatListView(
    _ view: ComposeChatListHostingView,
    requestItems requestId: NSNumber,
    version: NSNumber,
    indicesJson: String,
    resetIndicesJson: String
  )

  func composeChatListView(
    _ view: ComposeChatListHostingView,
    reactToItem index: NSNumber,
    reaction: String
  )
}

@objcMembers
final class ComposeChatListHostingView: UIView {
  weak var delegate: ComposeChatListViewDelegate?

  private let store = ComposeChatListStore()
  private lazy var host = UIHostingController(rootView: ComposeChatListRootView(store: store))

  override init(frame: CGRect) {
    super.init(frame: frame)
    installHost()
    store.onRequestItems = { [weak self] requestId, version, indicesJson, resetIndicesJson in
      guard let self else { return }
      self.delegate?.composeChatListView(
        self,
        requestItems: NSNumber(value: requestId),
        version: NSNumber(value: version),
        indicesJson: indicesJson,
        resetIndicesJson: resetIndicesJson
      )
    }
    store.onReactToItem = { [weak self] index, reaction in
      guard let self else { return }
      self.delegate?.composeChatListView(
        self,
        reactToItem: NSNumber(value: index),
        reaction: reaction
      )
    }
  }

  required init?(coder: NSCoder) {
    super.init(coder: coder)
    installHost()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    host.view.frame = bounds
  }

  func setRenderMode(_ renderMode: String) {
    store.renderMode = renderMode
  }

  func setListName(_ listName: String) {
    store.listName = listName
  }

  func setPlaceholderSpec(_ placeholderSpec: NSDictionary?) {
    store.placeholderSpec = PlaceholderSpec(payload: placeholderSpec)
  }

  func setInitialIndexToRender(_ initialIndexToRender: Int) {
    store.setInitialIndexToRender(initialIndexToRender)
  }

  func applyDataState(
    version: Int,
    count: Int,
    reset: Bool,
    ops: [[String: Any]]
  ) {
    store.applyDataState(version: version, count: count, reset: reset, ops: ops)
  }

  func applyRenderedItems(
    version: Int,
    requestId: Int,
    items: [[String: Any]]
  ) {
    store.applyRenderedItems(version: version, requestId: requestId, items: items)
  }

  func scrollToItem(index: Int, animated: Bool) {
    store.scrollToItem(index: index, animated: animated)
  }

  func resetItem(index: Int) {
    store.resetItem(index: index)
  }

  func prepareForRecycle() {
    store.prepareForRecycle()
  }

  private func installHost() {
    backgroundColor = UIColor.systemBackground
    host.view.backgroundColor = .clear
    host.view.frame = bounds
    addSubview(host.view)
  }
}

private final class ComposeChatListStore: ObservableObject {
  @Published var itemCount = 0
  @Published var version = 0
  @Published var rowsByIndex: [Int: RenderedChatItemModel] = [:]
  @Published var dirtyIndices = Set<Int>()
  @Published var scrollAnchorToken = 0
  @Published var initialScrollToken = 0
  @Published var commandScrollToken = 0
  @Published var placeholderSpec = PlaceholderSpec.default
  var scrollAnchorIndex: Int?
  var initialScrollIndex: Int?
  var commandScrollIndex: Int?
  var commandScrollAnimated = false

  var renderMode = "main"
  var listName = "ios-compose-chat-list"
  var onRequestItems: ((Int, Int, String, String) -> Void)?
  var onReactToItem: ((Int, String) -> Void)?

  private var lastAppliedSeq = 0
  private var nextRequestId = 1
  private var visibleIndices = Set<Int>()
  private var pendingRequestIndices = Set<Int>()
  private var pendingResetRequestIndices = Set<Int>()
  private var requestedKeys = Set<String>()
  private var flushScheduled = false
  private var initialIndexToRender = 0
  private var initialScrollApplied = false

  func prepareForRecycle() {
    itemCount = 0
    version = 0
    rowsByIndex.removeAll()
    dirtyIndices.removeAll()
    scrollAnchorToken = 0
    initialScrollToken = 0
    commandScrollToken = 0
    placeholderSpec = .default
    scrollAnchorIndex = nil
    initialScrollIndex = nil
    commandScrollIndex = nil
    commandScrollAnimated = false
    lastAppliedSeq = 0
    visibleIndices.removeAll()
    pendingRequestIndices.removeAll()
    pendingResetRequestIndices.removeAll()
    requestedKeys.removeAll()
    flushScheduled = false
    initialIndexToRender = 0
    initialScrollApplied = false
  }

  func setInitialIndexToRender(_ nextInitialIndexToRender: Int) {
    let nextIndex = max(0, nextInitialIndexToRender)
    guard initialIndexToRender != nextIndex else {
      return
    }

    initialIndexToRender = nextIndex
    initialScrollApplied = false
    scheduleInitialScrollIfNeeded()
  }

  func applyDataState(version: Int, count: Int, reset: Bool, ops: [[String: Any]]) {
    let previousCount = itemCount
    self.version = version
    itemCount = max(0, count)

    if reset {
      rowsByIndex.removeAll(keepingCapacity: true)
      dirtyIndices.removeAll(keepingCapacity: true)
      requestedKeys.removeAll(keepingCapacity: true)
      lastAppliedSeq = 0
    }

    if reset || (previousCount == 0 && itemCount > 0) {
      initialScrollApplied = false
    }

    for op in ops {
      let seq = intValue(op["seq"])
      if seq <= lastAppliedSeq {
        continue
      }

      let index = intValue(op["index"])
      let count = max(1, intValue(op["count"]))
      switch stringValue(op["type"]) {
      case "insert":
        if let anchorIndex = visibleIndices.min(), index <= anchorIndex {
          scrollAnchorIndex = anchorIndex + count
          scrollAnchorToken += 1
        }
        shiftRows(startingAt: index, by: count)
        markDirty(range: index..<(index + count))
      case "remove":
        removeRows(startingAt: index, count: count)
      case "update":
        if index >= 0 && index < itemCount {
          dirtyIndices.insert(index)
        }
      case "swapPairs":
        swapPairs(startingAt: index, count: count)
      case "reset":
        rowsByIndex.removeAll(keepingCapacity: true)
        dirtyIndices.removeAll(keepingCapacity: true)
        requestedKeys.removeAll(keepingCapacity: true)
      default:
        break
      }
      lastAppliedSeq = seq
    }

    scheduleInitialScrollIfNeeded()
    requestVisibleDirtyRows()
  }

  func applyRenderedItems(version: Int, requestId: Int, items: [[String: Any]]) {
    guard version == self.version else {
      return
    }

    for payload in items {
      let item = RenderedChatItemModel(payload: payload)
      guard item.index >= 0 && item.index < itemCount else {
        continue
      }

      rowsByIndex[item.index] = item
      dirtyIndices.remove(item.index)
      requestedKeys.remove(requestKey(for: item.index))
    }
  }

  func rowAppeared(_ index: Int) {
    visibleIndices.insert(index)
    requestWindow(around: index)
  }

  func rowDisappeared(_ index: Int) {
    visibleIndices.remove(index)
  }

  func reactToItem(index: Int, reaction: String) {
    dirtyIndices.insert(index)
    onReactToItem?(index, reaction)
  }

  func scrollToItem(index: Int, animated: Bool) {
    guard itemCount > 0 else {
      return
    }

    let target = min(max(index, 0), itemCount - 1)
    commandScrollIndex = target
    commandScrollAnimated = animated
    requestWindow(around: target)
    commandScrollToken += 1
  }

  func scheduleInitialScrollIfNeeded() {
    guard !initialScrollApplied, itemCount > 0 else {
      return
    }

    let target = min(max(initialIndexToRender, 0), itemCount - 1)
    initialScrollApplied = true
    initialScrollIndex = target
    requestWindow(around: target)
    initialScrollToken += 1
  }

  func resetItem(index: Int) {
    guard itemCount > 0 else {
      return
    }

    let target = min(max(index, 0), itemCount - 1)
    dirtyIndices.insert(target)
    requestedKeys.remove(requestKey(for: target))
    enqueueRequest(indices: [target], resetIndices: [target])
  }

  private func requestWindow(around index: Int) {
    guard itemCount > 0 else {
      return
    }

    let lowerBound = max(0, index - 8)
    let upperBound = min(itemCount - 1, index + 18)
    let indices = lowerBound...upperBound
    let needed = indices.filter { rowIndex in
      (rowsByIndex[rowIndex] == nil || dirtyIndices.contains(rowIndex))
        && !requestedKeys.contains(requestKey(for: rowIndex))
    }

    enqueueRequest(indices: needed)
  }

  private func requestVisibleDirtyRows() {
    let indices = visibleIndices
      .filter { $0 >= 0 && $0 < itemCount }
      .filter { dirtyIndices.contains($0) || rowsByIndex[$0] == nil }
    enqueueRequest(indices: Array(indices))
  }

  private func enqueueRequest(indices: [Int], resetIndices: [Int] = []) {
    let resetIndexSet = Set(resetIndices)
    let newIndices = indices.filter { index in
      let key = requestKey(for: index)
      if resetIndexSet.contains(index) {
        requestedKeys.remove(key)
      }
      guard !requestedKeys.contains(key) else {
        return false
      }
      requestedKeys.insert(key)
      return true
    }

    guard !newIndices.isEmpty else {
      return
    }

    pendingRequestIndices.formUnion(newIndices)
    pendingResetRequestIndices.formUnion(newIndices.filter { resetIndexSet.contains($0) })
    scheduleFlush()
  }

  private func scheduleFlush() {
    guard !flushScheduled else {
      return
    }

    flushScheduled = true
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.008) { [weak self] in
      self?.flushRequests()
    }
  }

  private func flushRequests() {
    flushScheduled = false
    let indices = pendingRequestIndices.sorted()
    let resetIndices = pendingResetRequestIndices.sorted()
    pendingRequestIndices.removeAll(keepingCapacity: true)
    pendingResetRequestIndices.removeAll(keepingCapacity: true)
    guard !indices.isEmpty else {
      return
    }

    let requestId = nextRequestId
    nextRequestId += 1
    onRequestItems?(
      requestId,
      version,
      indices.map(String.init).joined(separator: ","),
      resetIndices.map(String.init).joined(separator: ",")
    )
  }

  private func shiftRows(startingAt startIndex: Int, by delta: Int) {
    guard delta != 0 else {
      return
    }

    var nextRows: [Int: RenderedChatItemModel] = [:]
    nextRows.reserveCapacity(rowsByIndex.count)
    for (index, row) in rowsByIndex {
      if index >= startIndex {
        nextRows[index + delta] = row.withIndex(index + delta)
      } else {
        nextRows[index] = row
      }
    }
    rowsByIndex = nextRows

    dirtyIndices = Set(dirtyIndices.map { $0 >= startIndex ? $0 + delta : $0 })
    visibleIndices = Set(visibleIndices.map { $0 >= startIndex ? $0 + delta : $0 })
  }

  private func removeRows(startingAt startIndex: Int, count: Int) {
    let removedRange = startIndex..<(startIndex + count)
    var nextRows: [Int: RenderedChatItemModel] = [:]
    nextRows.reserveCapacity(rowsByIndex.count)
    for (index, row) in rowsByIndex {
      if removedRange.contains(index) {
        continue
      }
      if index >= startIndex + count {
        nextRows[index - count] = row.withIndex(index - count)
      } else {
        nextRows[index] = row
      }
    }
    rowsByIndex = nextRows

    dirtyIndices = Set(dirtyIndices.compactMap { index in
      if removedRange.contains(index) {
        return nil
      }
      return index >= startIndex + count ? index - count : index
    })
    visibleIndices = Set(visibleIndices.compactMap { index in
      if removedRange.contains(index) {
        return nil
      }
      return index >= startIndex + count ? index - count : index
    })
  }

  private func markDirty(range: Range<Int>) {
    for index in range where index >= 0 && index < itemCount {
      dirtyIndices.insert(index)
    }
  }

  private func swapPairs(startingAt startIndex: Int, count: Int) {
    let safeIndex = min(max(startIndex, 0), itemCount)
    let safeCount = max(0, min(count, itemCount - safeIndex))
    let pairCount = safeCount / 2
    guard pairCount > 0 else {
      return
    }

    for pair in 0..<pairCount {
      let firstIndex = safeIndex + pair * 2
      let secondIndex = firstIndex + 1
      let first = rowsByIndex[firstIndex]
      let second = rowsByIndex[secondIndex]

      if let first, let second {
        rowsByIndex[firstIndex] = second.withIndex(firstIndex)
        rowsByIndex[secondIndex] = first.withIndex(secondIndex)
      } else if let first {
        rowsByIndex[firstIndex] = nil
        rowsByIndex[secondIndex] = first.withIndex(secondIndex)
      } else if let second {
        rowsByIndex[firstIndex] = second.withIndex(firstIndex)
        rowsByIndex[secondIndex] = nil
      }

      dirtyIndices.insert(firstIndex)
      dirtyIndices.insert(secondIndex)
    }
  }

  private func requestKey(for index: Int) -> String {
    "\(version):\(index)"
  }
}

private struct RenderedChatItemModel: Equatable {
  let index: Int
  let id: String
  let type: String
  let author: String
  let body: String
  let isOwn: Bool
  let reactionSummary: String
  let reactionDetails: String
  let renderVersion: Int

  var reactions: [ReactionChipModel] {
    reactionDetails
      .split(separator: ",")
      .compactMap { rawValue -> ReactionChipModel? in
        let parts = rawValue.split(separator: ":", maxSplits: 1)
        guard parts.count == 2, let count = Int(parts[1]), count > 0 else {
          return nil
        }
        return ReactionChipModel(name: String(parts[0]), count: count)
      }
  }

  init(payload: [String: Any]) {
    index = intValue(payload["index"])
    id = stringValue(payload["id"])
    type = stringValue(payload["type"])
    author = stringValue(payload["author"])
    body = stringValue(payload["body"])
    isOwn = boolValue(payload["isOwn"])
    reactionSummary = stringValue(payload["reactionSummary"])
    reactionDetails = stringValue(payload["reactionDetails"])
    renderVersion = intValue(payload["renderVersion"])
  }

  private init(
    index: Int,
    id: String,
    type: String,
    author: String,
    body: String,
    isOwn: Bool,
    reactionSummary: String,
    reactionDetails: String,
    renderVersion: Int
  ) {
    self.index = index
    self.id = id
    self.type = type
    self.author = author
    self.body = body
    self.isOwn = isOwn
    self.reactionSummary = reactionSummary
    self.reactionDetails = reactionDetails
    self.renderVersion = renderVersion
  }

  func withIndex(_ nextIndex: Int) -> RenderedChatItemModel {
    RenderedChatItemModel(
      index: nextIndex,
      id: id,
      type: type,
      author: author,
      body: body,
      isOwn: isOwn,
      reactionSummary: reactionSummary,
      reactionDetails: reactionDetails,
      renderVersion: renderVersion
    )
  }
}

private struct ReactionChipModel: Identifiable, Equatable {
  let name: String
  let count: Int

  var id: String {
    name
  }

  var symbol: String {
    switch name {
    case "like": return "👍"
    case "love": return "❤️"
    case "laugh": return "😂"
    case "wow": return "😮"
    case "fire": return "🔥"
    default: return name
    }
  }
}

private struct PlaceholderSpec: Equatable {
  let version: Int
  let defaultVariant: String
  let templates: [PlaceholderTemplate]

  static let `default` = PlaceholderSpec(
    version: 1,
    defaultVariant: "chat",
    templates: [
      PlaceholderTemplate(
        key: "chat-default",
        variant: "chat",
        align: "alternate",
        minWidth: 176,
        maxWidth: 302,
        height: 56,
        lines: 2,
        showAvatar: false,
        showFooter: true
      )
    ]
  )

  init(version: Int, defaultVariant: String, templates: [PlaceholderTemplate]) {
    self.version = version
    self.defaultVariant = sanitizePlaceholderVariant(defaultVariant)
    self.templates = templates.isEmpty ? PlaceholderSpec.default.templates : templates
  }

  init(payload: NSDictionary?) {
    guard let payload else {
      self = .default
      return
    }

    let fallbackVariant = sanitizePlaceholderVariant(stringValue(payload["defaultVariant"], fallback: "chat"))
    let rawTemplates = payload["templates"] as? [NSDictionary]
      ?? (payload["templates"] as? NSArray)?.compactMap { $0 as? NSDictionary }
      ?? []
    let parsedTemplates = rawTemplates.enumerated().map { offset, rawTemplate in
      PlaceholderTemplate(index: offset, defaultVariant: fallbackVariant, payload: rawTemplate)
    }

    self.init(
      version: intValue(payload["version"], fallback: 1),
      defaultVariant: fallbackVariant,
      templates: parsedTemplates
    )
  }

  func template(for index: Int) -> PlaceholderTemplate {
    templates[index % templates.count]
  }
}

private struct PlaceholderTemplate: Equatable {
  let key: String
  let variant: String
  let align: String
  let minWidth: Int
  let maxWidth: Int
  let height: Int
  let lines: Int
  let showAvatar: Bool
  let showFooter: Bool

  init(
    key: String,
    variant: String,
    align: String,
    minWidth: Int,
    maxWidth: Int,
    height: Int,
    lines: Int,
    showAvatar: Bool,
    showFooter: Bool
  ) {
    self.key = key
    self.variant = sanitizePlaceholderVariant(variant)
    self.align = sanitizePlaceholderAlign(align)
    self.minWidth = min(max(minWidth, 48), 420)
    self.maxWidth = min(max(maxWidth, 48), 420)
    self.height = min(max(height, 0), 260)
    self.lines = min(max(lines, 1), 4)
    self.showAvatar = showAvatar
    self.showFooter = showFooter
  }

  init(index: Int, defaultVariant: String, payload: NSDictionary) {
    self.init(
      key: stringValue(payload["key"], fallback: "placeholder-\(index)"),
      variant: stringValue(payload["variant"], fallback: defaultVariant),
      align: stringValue(payload["align"], fallback: "alternate"),
      minWidth: intValue(payload["minWidth"], fallback: 176),
      maxWidth: intValue(payload["maxWidth"], fallback: 302),
      height: intValue(payload["height"], fallback: 56),
      lines: intValue(payload["lines"], fallback: 2),
      showAvatar: boolValue(payload["showAvatar"], fallback: false),
      showFooter: boolValue(payload["showFooter"], fallback: true)
    )
  }
}

private struct ComposeChatListRootView: View {
  @ObservedObject var store: ComposeChatListStore

  var body: some View {
    ScrollViewReader { proxy in
      ScrollView {
        LazyVStack(alignment: .leading, spacing: 8) {
          ForEach(0..<store.itemCount, id: \.self) { index in
            Group {
              if let item = store.rowsByIndex[index] {
                ChatMessageRow(
                  item: item,
                  isDirty: store.dirtyIndices.contains(index),
                  onReaction: { reaction in
                    store.reactToItem(index: index, reaction: reaction)
                  }
                )
                .accessibilityIdentifier("chat-row-\(index)-v\(item.renderVersion)")
              } else {
                ChatSkeletonRow(index: index, template: store.placeholderSpec.template(for: index))
                  .accessibilityIdentifier("chat-row-\(index)-skeleton")
              }
            }
            .id(index)
            .onAppear {
              store.rowAppeared(index)
            }
            .onDisappear {
              store.rowDisappeared(index)
            }
          }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
      }
      .onChange(of: store.scrollAnchorToken) { _ in
        guard let target = store.scrollAnchorIndex else {
          return
        }

        DispatchQueue.main.async {
          var transaction = Transaction()
          transaction.disablesAnimations = true
          withTransaction(transaction) {
            proxy.scrollTo(target, anchor: .top)
          }
        }
      }
      .onChange(of: store.initialScrollToken) { _ in
        guard let target = store.initialScrollIndex else {
          return
        }

        DispatchQueue.main.async {
          var transaction = Transaction()
          transaction.disablesAnimations = true
          withTransaction(transaction) {
            proxy.scrollTo(target, anchor: .top)
          }
        }
      }
      .onChange(of: store.commandScrollToken) { _ in
        guard let target = store.commandScrollIndex else {
          return
        }

        DispatchQueue.main.async {
          if store.commandScrollAnimated {
            withAnimation(.easeInOut(duration: 0.25)) {
              proxy.scrollTo(target, anchor: .top)
            }
          } else {
            var transaction = Transaction()
            transaction.disablesAnimations = true
            withTransaction(transaction) {
              proxy.scrollTo(target, anchor: .top)
            }
          }
        }
      }
      .onAppear {
        store.scheduleInitialScrollIfNeeded()
      }
    }
    .transaction { transaction in
      transaction.animation = nil
    }
    .background(Color(uiColor: .systemBackground))
  }
}

private struct ChatMessageRow: View {
  let item: RenderedChatItemModel
  let isDirty: Bool
  let onReaction: (String) -> Void

  private let reactionNames = ["like", "love", "laugh", "wow", "fire"]

  var body: some View {
    HStack {
      if item.isOwn {
        Spacer(minLength: 36)
      }

      VStack(alignment: item.isOwn ? .trailing : .leading, spacing: 7) {
        Text(item.author)
          .font(.caption.weight(.semibold))
          .foregroundStyle(.secondary)

        Color.clear
          .frame(width: 1, height: 1)
          .accessibilityIdentifier("chat-row-\(item.index)-item-\(item.id)")

        Text(item.body)
          .font(.body)
          .foregroundStyle(item.isOwn ? Color.white : Color.primary)
          .multilineTextAlignment(item.isOwn ? .trailing : .leading)
          .padding(.horizontal, 12)
          .padding(.vertical, 9)
          .background(item.isOwn ? Color(red: 0.08, green: 0.38, blue: 0.74) : Color(uiColor: .secondarySystemBackground))
          .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))

        ScrollView(.horizontal, showsIndicators: false) {
          HStack(spacing: 6) {
            Button {
              onReaction(reactionNames[item.index % reactionNames.count])
            } label: {
              Text("+")
                .font(.caption.weight(.bold))
                .frame(width: 28, height: 24)
                .background(Color(uiColor: .tertiarySystemFill))
                .clipShape(Capsule())
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("chat-reaction-add-\(item.index)")

            ForEach(item.reactions) { reaction in
              Button {
                onReaction(reaction.name)
              } label: {
                Text("\(reaction.symbol) \(reaction.count)")
                  .font(.caption.weight(.semibold))
                  .padding(.horizontal, 8)
                  .frame(height: 24)
                  .background(Color(uiColor: .tertiarySystemFill))
                  .clipShape(Capsule())
              }
              .buttonStyle(.plain)
              .accessibilityIdentifier("chat-reaction-\(item.index)-\(reaction.name)-\(reaction.count)")
            }
          }
        }
        .frame(maxWidth: 260, alignment: item.isOwn ? .trailing : .leading)
      }
      .opacity(isDirty ? 0.82 : 1)
      .frame(maxWidth: 320, alignment: item.isOwn ? .trailing : .leading)

      if !item.isOwn {
        Spacer(minLength: 36)
      }
    }
  }
}

private struct ChatSkeletonRow: View {
  let index: Int
  let template: PlaceholderTemplate

  var body: some View {
    switch template.variant {
    case "card":
      CardSkeletonRow(index: index, template: template)
    case "media":
      MediaSkeletonRow(index: index, template: template)
    case "compact":
      CompactSkeletonRow(index: index, template: template)
    default:
      ChatBubbleSkeletonRow(index: index, template: template)
    }
  }
}

private struct ChatBubbleSkeletonRow: View {
  let index: Int
  let template: PlaceholderTemplate

  var body: some View {
    let own = isEndAligned(index: index, template: template)
    HStack {
      if own {
        Spacer(minLength: 36)
      }

      if template.showAvatar && !own {
        PlaceholderBlock()
          .frame(width: 34, height: 34)
          .clipShape(Circle())
      }

      VStack(alignment: .leading, spacing: 8) {
        PlaceholderBlock()
          .frame(width: 78, height: 10)

        ForEach(0..<template.lines, id: \.self) { line in
          PlaceholderBlock()
            .frame(width: CGFloat(lineWidth(index: index, template: template, line: line)), height: 12)
        }

        if template.showFooter {
          PlaceholderBlock()
            .frame(width: 120, height: 18)
        }
      }
      .padding(.horizontal, 12)
      .padding(.vertical, 10)
      .frame(width: CGFloat(placeholderWidth(index: index, template: template)), alignment: .leading)
      .background(Color(uiColor: .secondarySystemFill))
      .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))

      if template.showAvatar && own {
        PlaceholderBlock()
          .frame(width: 34, height: 34)
          .clipShape(Circle())
      }

      if !own {
        Spacer(minLength: 36)
      }
    }
  }
}

private struct CardSkeletonRow: View {
  let index: Int
  let template: PlaceholderTemplate

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      PlaceholderBlock()
        .frame(width: 120, height: 12)
      ForEach(0..<template.lines, id: \.self) { line in
        PlaceholderBlock()
          .frame(maxWidth: line == 0 ? .infinity : 250, minHeight: 14, maxHeight: 14)
      }
      if template.showFooter {
        HStack {
          PlaceholderBlock()
            .frame(width: 68, height: 22)
          PlaceholderBlock()
            .frame(width: 88, height: 22)
        }
      }
    }
    .padding(14)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(Color(uiColor: .secondarySystemBackground))
    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
  }
}

private struct MediaSkeletonRow: View {
  let index: Int
  let template: PlaceholderTemplate

  var body: some View {
    HStack(spacing: 12) {
      PlaceholderBlock(color: Color(uiColor: .secondarySystemFill))
        .frame(width: 72, height: CGFloat(max(template.height, 56)))
      VStack(alignment: .leading, spacing: 8) {
        ForEach(0..<min(template.lines, 3), id: \.self) { line in
          PlaceholderBlock()
            .frame(maxWidth: line == 0 ? .infinity : 190, minHeight: 13, maxHeight: 13)
        }
      }
    }
  }
}

private struct CompactSkeletonRow: View {
  let index: Int
  let template: PlaceholderTemplate

  var body: some View {
    HStack(spacing: 10) {
      if template.showAvatar {
        PlaceholderBlock()
          .frame(width: 28, height: 28)
          .clipShape(Circle())
      }
      PlaceholderBlock()
        .frame(width: CGFloat(placeholderWidth(index: index, template: template)), height: 14)
      Spacer(minLength: 0)
    }
  }
}

private struct PlaceholderBlock: View {
  var color = Color(uiColor: .tertiarySystemFill)

  var body: some View {
    RoundedRectangle(cornerRadius: 7, style: .continuous)
      .fill(color)
  }
}

private func placeholderWidth(index: Int, template: PlaceholderTemplate) -> Int {
  let minWidth = max(48, min(template.minWidth, template.maxWidth))
  let maxWidth = max(minWidth, template.maxWidth)
  return minWidth + ((index * 37) % (maxWidth - minWidth + 1))
}

private func lineWidth(index: Int, template: PlaceholderTemplate, line: Int) -> Int {
  max(44, placeholderWidth(index: index + line, template: template) - (line * 28))
}

private func isEndAligned(index: Int, template: PlaceholderTemplate) -> Bool {
  switch template.align {
  case "end": return true
  case "alternate": return index.isMultiple(of: 3)
  default: return false
  }
}

private func sanitizePlaceholderVariant(_ variant: String) -> String {
  switch variant {
  case "card", "media", "compact": return variant
  default: return "chat"
  }
}

private func sanitizePlaceholderAlign(_ align: String) -> String {
  switch align {
  case "end", "alternate": return align
  default: return "start"
  }
}

private func intValue(_ value: Any?) -> Int {
  if let int = value as? Int {
    return int
  }
  if let number = value as? NSNumber {
    return number.intValue
  }
  return 0
}

private func intValue(_ value: Any?, fallback: Int) -> Int {
  if let int = value as? Int {
    return int
  }
  if let number = value as? NSNumber {
    return number.intValue
  }
  return fallback
}

private func boolValue(_ value: Any?) -> Bool {
  if let bool = value as? Bool {
    return bool
  }
  if let number = value as? NSNumber {
    return number.boolValue
  }
  return false
}

private func boolValue(_ value: Any?, fallback: Bool) -> Bool {
  if let bool = value as? Bool {
    return bool
  }
  if let number = value as? NSNumber {
    return number.boolValue
  }
  return fallback
}

private func stringValue(_ value: Any?) -> String {
  if let string = value as? String {
    return string
  }
  return ""
}

private func stringValue(_ value: Any?, fallback: String) -> String {
  if let string = value as? String {
    return string
  }
  return fallback
}
