package com.nativecomposechat

import android.annotation.SuppressLint
import android.content.Context
import android.os.SystemClock
import android.util.Log
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTag
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.ReadableType
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.uimanager.ThemedReactContext
import kotlinx.coroutines.flow.distinctUntilChangedBy
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

@Immutable
data class RenderedChatItem(
    val id: String,
    val type: String,
    val author: String,
    val body: String,
    val isOwn: Boolean,
    val reactionSummary: String,
    val reactionDetails: String,
    val reactions: List<ChatReaction>,
    val renderVersion: Int,
)

@Immutable
data class ChatReaction(
    val name: String,
    val label: String,
    val count: Int,
)

@Immutable
data class PlaceholderSpec(
    val version: Int,
    val defaultVariant: String,
    val templates: List<PlaceholderTemplate>,
) {
  companion object {
    val Default =
        PlaceholderSpec(
            version = 1,
            defaultVariant = "chat",
            templates =
                listOf(
                    PlaceholderTemplate(
                        key = "chat-default",
                        variant = "chat",
                        align = "alternate",
                        minWidth = 176,
                        maxWidth = 302,
                        height = 0,
                        lines = 2,
                        showAvatar = false,
                        showFooter = true,
                    ),
                ),
        )
  }
}

@Immutable
data class PlaceholderTemplate(
    val key: String,
    val variant: String,
    val align: String,
    val minWidth: Int,
    val maxWidth: Int,
    val height: Int,
    val lines: Int,
    val showAvatar: Boolean,
    val showFooter: Boolean,
)

private data class VisibleItemLayout(
    val index: Int,
    val offset: Int,
    val size: Int,
)

private data class VisibleListLayout(
    val viewportStart: Int,
    val viewportEnd: Int,
    val items: List<VisibleItemLayout>,
)

private data class VisibleWindowSnapshot(
    val layout: VisibleListLayout,
    val firstIndex: Int,
    val firstOffset: Int,
    val isScrolling: Boolean,
)

private const val FABRIC_CELL_LOG_TAG = "FabricCellHolder"
private const val ITEM_REQUEST_LOG_TAG = "ComposeChatRequests"
private const val FABRIC_MOUNT_LOG_TAG = "FabricMount"
private const val FABRIC_HOST_LOG_TAG = "FabricHost"

private fun debugLog(message: String) {
  if (BuildConfig.DEBUG) {
    Log.d(FABRIC_CELL_LOG_TAG, message)
  }
}

private fun requestLog(message: String) {
  if (BuildConfig.DEBUG) {
    Log.d(ITEM_REQUEST_LOG_TAG, message)
  }
}

private fun fabricMountLog(message: String) {
  if (BuildConfig.DEBUG) {
    Log.d(FABRIC_MOUNT_LOG_TAG, message)
  }
}

private fun hostLog(message: String) {
  Log.i(FABRIC_HOST_LOG_TAG, message)
}

private fun ComposeChatListItemView.debugLabel(): String =
    diagnosticLabel()

private class FabricCellHolder(context: Context) : FrameLayout(context) {
  companion object {
    private var nextHolderId = 1
  }

  private val holderId = nextHolderId++
  private var updateCount = 0
  private var measureCount = 0
  private var layoutCount = 0
  private var lastDataKey = ""
  private var lastMeasureKey = ""

  var preferredHeightDp: Int = 0
    set(value) {
      val nextValue = max(0, value)
      if (field == nextValue) return
      field = nextValue
      requestLayout()
    }

  init {
    clipChildren = true
    clipToPadding = true
  }

  fun recordUpdate(dataKey: String, cell: ComposeChatListItemView) {
    updateCount += 1
    val dataChanged = lastDataKey.isNotEmpty() && lastDataKey != dataKey
    hostLog(
        "holder#$holderId update#$updateCount dataChanged=$dataChanged " +
            "children=$childCount data=[$dataKey] cell=${cell.diagnosticLabel()}",
    )
    debugLog(
        "holder#$holderId update#$updateCount dataChanged=$dataChanged " +
            "data=[$dataKey] cell=${cell.debugLabel()} children=$childCount",
    )
    lastDataKey = dataKey
  }

  fun recordReset(reason: String) {
    hostLog(
        "holder#$holderId $reason updates=$updateCount measures=$measureCount " +
            "layouts=$layoutCount lastData=[$lastDataKey] children=$childCount",
    )
    debugLog(
        "holder#$holderId $reason updates=$updateCount measures=$measureCount " +
            "layouts=$layoutCount lastData=[$lastDataKey] children=$childCount",
    )
    lastDataKey = ""
    lastMeasureKey = ""
  }

  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    val width = MeasureSpec.getSize(widthMeasureSpec).coerceAtLeast(1)
    val heightPx =
        if (preferredHeightDp > 0) {
          (preferredHeightDp * resources.displayMetrics.density + 0.5f).toInt()
        } else {
          MeasureSpec.getSize(heightMeasureSpec)
        }.coerceAtLeast(1)

    val exactWidth = MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY)
    val exactHeight = MeasureSpec.makeMeasureSpec(heightPx, MeasureSpec.EXACTLY)
    for (index in 0 until childCount) {
      getChildAt(index).measure(exactWidth, exactHeight)
    }
    setMeasuredDimension(width, heightPx)

    measureCount += 1
    val measureKey =
        "width=$width height=$heightPx preferredHeightDp=$preferredHeightDp " +
            "widthSpec=${MeasureSpec.toString(widthMeasureSpec)} " +
            "heightSpec=${MeasureSpec.toString(heightMeasureSpec)}"
    val measureChanged = lastMeasureKey.isNotEmpty() && lastMeasureKey != measureKey
    hostLog(
        "holder#$holderId measure#$measureCount changed=$measureChanged " +
            "$measureKey data=[$lastDataKey] children=$childCount",
    )
    debugLog(
        "holder#$holderId measure#$measureCount changed=$measureChanged " +
            "$measureKey data=[$lastDataKey] children=$childCount",
    )
    lastMeasureKey = measureKey
  }

  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
    val width = (right - left).coerceAtLeast(1)
    val height = (bottom - top).coerceAtLeast(1)
    for (index in 0 until childCount) {
      getChildAt(index).layout(0, 0, width, height)
    }
    layoutCount += 1
    hostLog(
        "holder#$holderId layout#$layoutCount changed=$changed " +
            "size=${width}x$height data=[$lastDataKey] children=$childCount",
    )
    debugLog(
        "holder#$holderId layout#$layoutCount changed=$changed " +
            "size=${width}x$height data=[$lastDataKey] children=$childCount",
    )
  }
}

private class FabricRowLogState {
  var recompositionCount = 0
  var lastDataKey = ""
}

@Stable
private class FabricRowSlot {
  var renderedRow by mutableStateOf<RenderedChatItem?>(null)
  var fabricCell by mutableStateOf<ComposeChatListItemView?>(null)
  var fabricCellHeight by mutableStateOf<Int?>(null)
}

@SuppressLint("ClickableViewAccessibility")
@Stable
class ComposeChatListView(context: Context) : FrameLayout(context) {
  private companion object {
    const val WINDOW_BEHIND = 4
    const val WINDOW_AHEAD = 8
    const val ACTIVE_SCROLL_WINDOW_BEHIND = 1
    const val ACTIVE_SCROLL_WINDOW_AHEAD = 2
    const val STALE_REQUEST_MS = 2_000L
  }

  private val renderedRows = mutableStateMapOf<Int, RenderedChatItem>()
  private val fabricCells = mutableStateMapOf<Int, ComposeChatListItemView>()
  private val fabricCellHeights = mutableStateMapOf<Int, Int>()
  private val rowSlots = mutableMapOf<Int, FabricRowSlot>()
  private val fabricChildren = mutableListOf<ComposeChatListItemView>()
  private val dirtyRows = mutableSetOf<Int>()
  private val pendingRequests = mutableMapOf<String, Long>()
  private val pendingRequestBatches = mutableMapOf<Int, List<Int>>()
  private var visibleRequestWindow: List<Int> = emptyList()
  private var itemCount by mutableIntStateOf(0)
  private var dataVersion by mutableIntStateOf(0)
  private var anchorScrollVersion by mutableIntStateOf(0)
  private var initialScrollVersion by mutableIntStateOf(0)
  private var commandScrollVersion by mutableIntStateOf(0)
  private var lastAppliedSeq = 0
  private var requestId = 1
  private var firstVisibleIndex = 0
  private var firstVisibleScrollOffset = 0
  private var pendingAnchorIndex = -1
  private var pendingAnchorOffset = 0
  private var initialIndexToRender = 0
  private var initialScrollApplied = false
  private var pendingInitialScrollIndex = -1
  private var pendingCommandScrollIndex = -1
  private var pendingCommandScrollAnimated = false
  private var renderMode = "main"
  private var listName = "compose-chat-list"
  private var backgroundAppName = "ComposeChatBackgroundRenderer"
  private var backgroundRootView: View? = null
  private var placeholderSpec by mutableStateOf(PlaceholderSpec.Default)
  private var visibleSpacingStatus by mutableStateOf("visible-list-spacing-pending")
  private var lastDispatchedWindowKey = ""
  private var staleRequestCheckScheduled = false

  init {
    val composeView =
        ComposeView(context).apply {
          layoutParams =
              LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
          setOnTouchListener { view, event ->
            when (event.actionMasked) {
              MotionEvent.ACTION_DOWN, MotionEvent.ACTION_MOVE ->
                  requestParentsDoNotIntercept(view, true)
              MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL ->
                  requestParentsDoNotIntercept(view, false)
            }
            false
          }
          setContent { ComposeChatList() }
        }
    addView(composeView)
  }

  val fabricChildCount: Int
    get() = fabricChildren.size

  fun addFabricChild(child: View, index: Int) {
    val cell = child as? ComposeChatListItemView ?: return
    if (fabricChildren.contains(cell)) return

    val startNs = SystemClock.elapsedRealtimeNanos()
    cell.owner = this
    fabricChildren.add(index.coerceIn(0, fabricChildren.size), cell)
    onFabricCellChanged(cell, -1)
    hostLog(
        "listCellAdd source=main poolSize=${fabricChildren.size} " +
            "durationUs=${(SystemClock.elapsedRealtimeNanos() - startNs) / 1_000} ${cell.diagnosticLabel()}",
    )
    fabricMountLog(
        "listCellAdd source=main ${cell.debugLabel()} poolSize=${fabricChildren.size} " +
            "durationUs=${(SystemClock.elapsedRealtimeNanos() - startNs) / 1_000}",
    )
  }

  fun addBackgroundFabricChild(cell: ComposeChatListItemView) {
    if (fabricChildren.contains(cell)) return

    val startNs = SystemClock.elapsedRealtimeNanos()
    cell.owner = this
    fabricChildren.add(cell)
    onFabricCellChanged(cell, -1)
    hostLog(
        "listCellAdd source=background poolSize=${fabricChildren.size} " +
            "durationUs=${(SystemClock.elapsedRealtimeNanos() - startNs) / 1_000} ${cell.diagnosticLabel()}",
    )
    fabricMountLog(
        "listCellAdd source=background ${cell.debugLabel()} poolSize=${fabricChildren.size} " +
            "durationUs=${(SystemClock.elapsedRealtimeNanos() - startNs) / 1_000}",
    )
  }

  fun removeFabricChild(child: View) {
    val cell = child as? ComposeChatListItemView ?: return
    val startNs = SystemClock.elapsedRealtimeNanos()
    fabricChildren.remove(cell)
    val activeIndex = cell.activeItemIndex()
    if (activeIndex >= 0 && fabricCells[activeIndex] === cell) {
      removeFabricCellAt(activeIndex)
      removeFabricCellHeight(activeIndex)
    }
    cell.owner = null
    hostLog(
        "listCellRemove poolSize=${fabricChildren.size} " +
            "durationUs=${(SystemClock.elapsedRealtimeNanos() - startNs) / 1_000} ${cell.diagnosticLabel()}",
    )
    fabricMountLog(
        "listCellRemove ${cell.debugLabel()} poolSize=${fabricChildren.size} " +
            "durationUs=${(SystemClock.elapsedRealtimeNanos() - startNs) / 1_000}",
    )
  }

  fun removeBackgroundFabricChild(cell: ComposeChatListItemView) {
    removeFabricChild(cell)
  }

  fun removeFabricChildAt(index: Int) {
    val cell = fabricChildren.getOrNull(index) ?: return
    removeFabricChild(cell)
  }

  fun removeAllFabricChildren() {
    fabricChildren.toList().forEach { cell -> removeFabricChild(cell) }
  }

  fun getFabricChildAt(index: Int): View? = fabricChildren.getOrNull(index)

  private fun rowSlot(index: Int): FabricRowSlot =
      rowSlots.getOrPut(index) { FabricRowSlot() }

  private fun setRenderedRow(index: Int, row: RenderedChatItem) {
    renderedRows[index] = row
    rowSlot(index).renderedRow = row
  }

  private fun removeRenderedRow(index: Int) {
    renderedRows.remove(index)
    rowSlots[index]?.renderedRow = null
  }

  private fun clearRenderedRows() {
    renderedRows.clear()
    rowSlots.values.forEach { it.renderedRow = null }
  }

  private fun setFabricCell(index: Int, cell: ComposeChatListItemView) {
    fabricCells[index] = cell
    rowSlot(index).fabricCell = cell
  }

  private fun removeFabricCellAt(index: Int) {
    fabricCells.remove(index)
    rowSlots[index]?.fabricCell = null
  }

  private fun clearFabricCells() {
    fabricCells.clear()
    rowSlots.values.forEach { it.fabricCell = null }
  }

  private fun setFabricCellHeight(index: Int, heightDp: Int) {
    fabricCellHeights[index] = heightDp
    rowSlot(index).fabricCellHeight = heightDp
  }

  private fun removeFabricCellHeight(index: Int) {
    fabricCellHeights.remove(index)
    rowSlots[index]?.fabricCellHeight = null
  }

  private fun clearFabricCellHeights() {
    fabricCellHeights.clear()
    rowSlots.values.forEach { it.fabricCellHeight = null }
  }

  fun onFabricCellChanged(cell: ComposeChatListItemView, previousIndex: Int) {
    val activeIndex = cell.activeItemIndex()
    hostLog(
        "cellChanged previousIndex=$previousIndex newIndex=$activeIndex rawIndex=${cell.itemIndex} " +
            "itemCount=$itemCount activeWindow=[${
              visibleRequestWindow.joinToString(",")
            }] ${cell.diagnosticLabel()}",
    )
    if (previousIndex >= 0 && fabricCells[previousIndex] === cell) {
      removeFabricCellAt(previousIndex)
      removeFabricCellHeight(previousIndex)
    }
    if (activeIndex in 0 until itemCount) {
      setFabricCell(activeIndex, cell)
    }
  }

  fun onFabricCellMeasured(index: Int, heightPx: Int) {
    if (index !in 0 until itemCount || heightPx <= 0) return

    val density = resources.displayMetrics.density.coerceAtLeast(1f)
    val heightDp = max(1, (heightPx / density + 0.5f).toInt())
    val current = fabricCellHeights[index]
    hostLog(
        "cellMeasured index=$index heightPx=$heightPx heightDp=$heightDp " +
            "currentDp=${current ?: 0} density=$density",
    )
    if (current == null || abs(current - heightDp) > 1) {
      setFabricCellHeight(index, heightDp)
    }
  }

  fun onFabricCellLaidOut(cell: ComposeChatListItemView) = Unit

  fun setRenderMode(nextRenderMode: String) {
    renderMode = if (nextRenderMode == "background") "background" else "main"
    configureBackgroundRuntime()
  }

  fun setListName(nextListName: String) {
    if (listName == nextListName) return

    BackgroundListRuntime.unregisterView(listName, this)
    listName = nextListName
    configureBackgroundRuntime()
  }

  fun setBackgroundAppName(nextBackgroundAppName: String) {
    backgroundAppName = nextBackgroundAppName
    configureBackgroundRuntime()
  }

  fun setPlaceholderSpec(nextPlaceholderSpec: ReadableMap?) {
    placeholderSpec = parsePlaceholderSpec(nextPlaceholderSpec)
  }

  fun setInitialIndexToRender(nextInitialIndexToRender: Int) {
    val nextIndex = max(0, nextInitialIndexToRender)
    if (initialIndexToRender == nextIndex) return

    initialIndexToRender = nextIndex
    initialScrollApplied = false
    scheduleInitialScrollIfNeeded()
  }

  fun applyDataState(dataState: ReadableMap?) {
    if (dataState == null) return

    val previousCount = itemCount
    val nextVersion = dataState.optInt("version", dataVersion)
    val nextCount = dataState.optInt("count", itemCount)
    val ops = dataState.optArray("ops")
    val shouldReset = ops == null || (dataState.optBoolean("reset", false) && nextVersion != dataVersion)

    if (shouldReset) {
      clearRenderedRows()
      dirtyRows.clear()
      pendingRequests.clear()
      pendingRequestBatches.clear()
      staleRequestCheckScheduled = false
      lastDispatchedWindowKey = ""
      if (ops != null) {
        lastAppliedSeq = max(lastAppliedSeq, maxSeq(ops))
      }
    } else {
      applyOps(ops)
    }

    dataVersion = nextVersion
    itemCount = max(0, nextCount)
    if (shouldReset || (previousCount == 0 && itemCount > 0)) {
      initialScrollApplied = false
    }

    if (renderMode == "background") {
      configureBackgroundRuntime()
      BackgroundListRuntime.updateDataState(listName, dataState)
    }

    scheduleInitialScrollIfNeeded()
    requestItemsForWindow(visibleRequestWindow)
  }

  fun applyRenderedItems(renderedItems: ReadableMap?) {
    if (renderedItems == null) return

    val incomingVersion = renderedItems.optInt("version", dataVersion)
    if (incomingVersion != dataVersion) return

    val incomingRequestId = renderedItems.optInt("requestId", -1)
    val requestedIndices = pendingRequestBatches.remove(incomingRequestId).orEmpty()
    val items = renderedItems.optArray("items") ?: return
    for (i in 0 until items.size()) {
      val row = items.getMap(i) ?: continue
      val index = row.optInt("index", -1)
      if (index < 0 || index >= itemCount) continue

      setRenderedRow(
          index,
          RenderedChatItem(
              id = row.optString("id", "row-$index"),
              type = row.optString("type", messageContentType(row.optBoolean("isOwn", false))),
              author = row.optString("author", ""),
              body = row.optString("body", ""),
              isOwn = row.optBoolean("isOwn", false),
              reactionSummary = row.optString("reactionSummary", ""),
              reactionDetails = row.optString("reactionDetails", ""),
              reactions = parseReactions(row.optString("reactionDetails", "")),
              renderVersion = row.optInt("renderVersion", incomingVersion),
          ),
      )
      dirtyRows.remove(index)
      pendingRequests.remove(requestKey(incomingVersion, index))
    }
    requestedIndices.forEach { index ->
      pendingRequests.remove(requestKey(incomingVersion, index))
    }
    pruneToActiveWindow()
    requestItemsForWindow(visibleRequestWindow)
  }

  fun scrollToItem(index: Int, animated: Boolean) {
    if (itemCount <= 0) return

    val targetIndex = min(max(index, 0), itemCount - 1)
    pendingCommandScrollIndex = targetIndex
    pendingCommandScrollAnimated = animated
    visibleRequestWindow = renderWindowAround(targetIndex)
    requestItemsForWindow(visibleRequestWindow)
    commandScrollVersion += 1
  }

  fun resetItem(index: Int) {
    if (itemCount <= 0) return

    val targetIndex = min(max(index, 0), itemCount - 1)
    dirtyRows.add(targetIndex)
    pendingRequests.remove(requestKey(dataVersion, targetIndex))
    requestItemsForWindow(activeWindowIncluding(targetIndex), setOf(targetIndex))
  }

  fun reactToItemFromBackground(index: Int, reaction: String) {
    emitReaction(index, reaction)
  }

  private fun applyOps(ops: ReadableArray) {
    for (i in 0 until ops.size()) {
      val op = ops.getMap(i) ?: continue
      val seq = op.optInt("seq", 0)
      if (seq <= lastAppliedSeq) continue

      when (op.optString("type", "")) {
        "insert" -> shiftForInsert(op.optInt("index", itemCount), op.optInt("count", 1))
        "remove" -> shiftForRemove(op.optInt("index", itemCount), op.optInt("count", 1))
        "update" -> applyUpdateOp(op)
        "swapPairs" -> applySwapPairs(op.optInt("index", 0), op.optInt("count", 0))
        "reset" -> {
          clearRenderedRows()
          dirtyRows.clear()
          clearFabricCellHeights()
          pendingRequestBatches.clear()
        }
      }
      lastAppliedSeq = seq
    }
    pendingRequests.clear()
    pendingRequestBatches.clear()
    lastDispatchedWindowKey = ""
  }

  private fun maxSeq(ops: ReadableArray): Int {
    var maxSeq = lastAppliedSeq
    for (i in 0 until ops.size()) {
      maxSeq = max(maxSeq, ops.getMap(i)?.optInt("seq", 0) ?: 0)
    }
    return maxSeq
  }

  private fun shiftForInsert(index: Int, count: Int) {
    val safeIndex = min(max(index, 0), itemCount)
    val safeCount = max(count, 0)
    if (safeCount == 0) return

    if (safeIndex <= firstVisibleIndex) {
      pendingAnchorIndex = firstVisibleIndex + safeCount
      pendingAnchorOffset = firstVisibleScrollOffset
      firstVisibleIndex += safeCount
      anchorScrollVersion += 1
    }

    val previous = renderedRows.toMap()
    val previousDirtyRows = dirtyRows.toSet()
    val previousFabricCells = fabricCells.toMap()
    val previousFabricCellHeights = fabricCellHeights.toMap()
    clearRenderedRows()
    dirtyRows.clear()
    clearFabricCells()
    clearFabricCellHeights()
    previous.forEach { (rowIndex, item) ->
      setRenderedRow(if (rowIndex >= safeIndex) rowIndex + safeCount else rowIndex, item)
    }
    previousDirtyRows.forEach { rowIndex ->
      dirtyRows.add(if (rowIndex >= safeIndex) rowIndex + safeCount else rowIndex)
    }
    previousFabricCells.forEach { (rowIndex, cell) ->
      setFabricCell(if (rowIndex >= safeIndex) rowIndex + safeCount else rowIndex, cell)
    }
    previousFabricCellHeights.forEach { (rowIndex, height) ->
      setFabricCellHeight(if (rowIndex >= safeIndex) rowIndex + safeCount else rowIndex, height)
    }
  }

  private fun shiftForRemove(index: Int, count: Int) {
    val safeIndex = min(max(index, 0), itemCount)
    val safeCount = max(count, 0)
    if (safeCount == 0) return

    val previous = renderedRows.toMap()
    val previousDirtyRows = dirtyRows.toSet()
    val previousFabricCells = fabricCells.toMap()
    val previousFabricCellHeights = fabricCellHeights.toMap()
    clearRenderedRows()
    dirtyRows.clear()
    clearFabricCells()
    clearFabricCellHeights()
    previous.forEach { (rowIndex, item) ->
      when {
        rowIndex < safeIndex -> setRenderedRow(rowIndex, item)
        rowIndex >= safeIndex + safeCount -> setRenderedRow(rowIndex - safeCount, item)
      }
    }
    previousDirtyRows.forEach { rowIndex ->
      when {
        rowIndex < safeIndex -> dirtyRows.add(rowIndex)
        rowIndex >= safeIndex + safeCount -> dirtyRows.add(rowIndex - safeCount)
      }
    }
    previousFabricCells.forEach { (rowIndex, cell) ->
      when {
        rowIndex < safeIndex -> setFabricCell(rowIndex, cell)
        rowIndex >= safeIndex + safeCount -> setFabricCell(rowIndex - safeCount, cell)
      }
    }
    previousFabricCellHeights.forEach { (rowIndex, height) ->
      when {
        rowIndex < safeIndex -> setFabricCellHeight(rowIndex, height)
        rowIndex >= safeIndex + safeCount -> setFabricCellHeight(rowIndex - safeCount, height)
      }
    }
  }

  private fun markDirty(index: Int) {
    if (index in 0 until itemCount) {
      dirtyRows.add(index)
    }
  }

  private fun applySwapPairs(index: Int, count: Int) {
    val safeIndex = min(max(index, 0), itemCount)
    val safeCount = max(0, min(count, itemCount - safeIndex))
    val pairCount = safeCount / 2
    if (pairCount == 0) return

    for (pair in 0 until pairCount) {
      val firstIndex = safeIndex + pair * 2
      val secondIndex = firstIndex + 1
      val first = renderedRows[firstIndex]
      val second = renderedRows[secondIndex]
      val firstFabric = fabricCells[firstIndex]
      val secondFabric = fabricCells[secondIndex]
      val firstFabricHeight = fabricCellHeights[firstIndex]
      val secondFabricHeight = fabricCellHeights[secondIndex]
      when {
        first != null && second != null -> {
          setRenderedRow(firstIndex, second)
          setRenderedRow(secondIndex, first)
        }
        first != null -> {
          removeRenderedRow(firstIndex)
          setRenderedRow(secondIndex, first)
        }
        second != null -> {
          setRenderedRow(firstIndex, second)
          removeRenderedRow(secondIndex)
        }
      }
      when {
        firstFabric != null && secondFabric != null -> {
          setFabricCell(firstIndex, secondFabric)
          setFabricCell(secondIndex, firstFabric)
        }
        firstFabric != null -> {
          removeFabricCellAt(firstIndex)
          setFabricCell(secondIndex, firstFabric)
        }
        secondFabric != null -> {
          setFabricCell(firstIndex, secondFabric)
          removeFabricCellAt(secondIndex)
        }
      }
      when {
        firstFabricHeight != null && secondFabricHeight != null -> {
          setFabricCellHeight(firstIndex, secondFabricHeight)
          setFabricCellHeight(secondIndex, firstFabricHeight)
        }
        firstFabricHeight != null -> {
          removeFabricCellHeight(firstIndex)
          setFabricCellHeight(secondIndex, firstFabricHeight)
        }
        secondFabricHeight != null -> {
          setFabricCellHeight(firstIndex, secondFabricHeight)
          removeFabricCellHeight(secondIndex)
        }
      }
      markDirty(firstIndex)
      markDirty(secondIndex)
    }
  }

  private fun applyUpdateOp(op: ReadableMap) {
    val index = op.optInt("index", -1)
    markDirty(index)

    val current = renderedRows[index] ?: return
    val payload = op.optMap("item") ?: return
    val nextReactions = reactionsFromPayload(payload)
    setRenderedRow(
        index,
        current.copy(
            id = payload.optString("id", current.id),
            type = messageContentType(payload.optBoolean("isOwn", current.isOwn)),
            author = payload.optString("author", current.author),
            body = payload.optString("body", current.body),
            isOwn = payload.optBoolean("isOwn", current.isOwn),
            reactionSummary = reactionSummary(nextReactions),
            reactionDetails = serializeReactions(nextReactions),
            reactions = nextReactions,
        ),
    )
  }

  @Composable
  private fun ComposeChatList() {
    val listState = rememberLazyListState()

    LaunchedEffect(listState, dataVersion, itemCount) {
      snapshotFlow {
            val layoutInfo = listState.layoutInfo
            VisibleWindowSnapshot(
                layout =
                    VisibleListLayout(
                        viewportStart = layoutInfo.viewportStartOffset,
                        viewportEnd = layoutInfo.viewportEndOffset,
                        items =
                            layoutInfo.visibleItemsInfo.map { item ->
                              VisibleItemLayout(
                                  index = item.index,
                                  offset = item.offset,
                                  size = item.size,
                              )
                            },
                ),
                firstIndex = listState.firstVisibleItemIndex,
                firstOffset = listState.firstVisibleItemScrollOffset,
                isScrolling = listState.isScrollInProgress,
            )
          }
          .distinctUntilChangedBy { snapshot ->
            snapshot.layout.items.map { it.index } to snapshot.isScrolling
          }
          .collect { snapshot ->
            val visibleLayout = snapshot.layout
            if (!snapshot.isScrolling) {
              visibleSpacingStatus = spacingStatusFor(visibleLayout)
            }
            val visibleIndices = visibleLayout.items.map { it.index }
            firstVisibleIndex = snapshot.firstIndex
            firstVisibleScrollOffset = snapshot.firstOffset
            val requestedIndices =
                requestWindowFor(
                    visibleIndices = visibleIndices,
                    useActiveScrollWindow = snapshot.isScrolling,
                )
            if (requestedIndices != visibleRequestWindow) {
              visibleRequestWindow = requestedIndices
              requestItemsForWindow(requestedIndices)
            }
          }
    }

    LaunchedEffect(itemCount, dataVersion) {
      if (itemCount <= 0) return@LaunchedEffect
      val visibleIndices = listState.layoutInfo.visibleItemsInfo.map { it.index }
      if (visibleIndices.isEmpty()) return@LaunchedEffect

      val requestedIndices =
          requestWindowFor(
              visibleIndices = visibleIndices,
              useActiveScrollWindow = false,
          )
      if (requestedIndices != visibleRequestWindow) {
        visibleRequestWindow = requestedIndices
        requestItemsForWindow(requestedIndices)
      }
    }

    Box(modifier = Modifier.fillMaxSize()) {
      LazyColumn(
          modifier = Modifier.fillMaxSize().background(Color(0xFFF6F7F9)),
          state = listState,
      ) {
        items(
            count = itemCount,
            key = { index -> index },
            contentType = { index ->
              val slot = rowSlot(index)
              val item = slot.renderedRow
              if (item == null) {
                "placeholder"
              } else {
                slot.fabricCell?.contentType ?: item.type
              }
            },
          ) { index ->
          val slot = rowSlot(index)
          val item = slot.renderedRow
          val fabricCell = slot.fabricCell
          val measuredHeightDp = slot.fabricCellHeight
          if (item == null) {
            FastSkeletonRow(index)
          } else if (fabricCell != null) {
            FabricCellRow(
                index = index,
                cell = fabricCell,
                item = item,
                measuredHeightDp = measuredHeightDp,
            )
          } else {
            ChatRow(index = index, item = item)
          }
        }
      }
      Box(
          modifier =
              Modifier.width(1.dp)
                  .height(1.dp)
                  .semantics {
                    testTag = "visible-list-spacing-status"
                    contentDescription = visibleSpacingStatus
                  },
      )
    }

    LaunchedEffect(anchorScrollVersion) {
      val anchorIndex = pendingAnchorIndex
      if (anchorIndex >= 0 && anchorIndex < itemCount) {
        listState.scrollToItem(anchorIndex, pendingAnchorOffset)
      }
    }

    LaunchedEffect(initialScrollVersion) {
      val targetIndex = pendingInitialScrollIndex
      if (targetIndex >= 0 && targetIndex < itemCount) {
        visibleRequestWindow = renderWindowAround(targetIndex)
        requestItemsForWindow(visibleRequestWindow)
        listState.scrollToItem(targetIndex)
      }
    }

    LaunchedEffect(commandScrollVersion) {
      val targetIndex = pendingCommandScrollIndex
      if (targetIndex >= 0 && targetIndex < itemCount) {
        visibleRequestWindow = renderWindowAround(targetIndex)
        requestItemsForWindow(visibleRequestWindow)
        if (pendingCommandScrollAnimated) {
          listState.animateScrollToItem(targetIndex)
        } else {
          listState.scrollToItem(targetIndex)
        }
      }
    }
  }

  @Composable
  private fun FabricCellRow(
      index: Int,
      cell: ComposeChatListItemView,
      item: RenderedChatItem?,
      measuredHeightDp: Int?,
  ) {
    val expectedMountedCellId = cell.itemId
    val debugDataKey =
        "index=$index itemId=${cell.itemId} renderVersion=${cell.renderVersion} " +
            "contentType=${cell.contentType} measuredHeightDp=${measuredHeightDp ?: 0} " +
            "dataVersion=$dataVersion"
    val rowLogState = remember(index, expectedMountedCellId) { FabricRowLogState() }
    val androidViewModifier =
        if (measuredHeightDp != null && measuredHeightDp > 0) {
          Modifier.fillMaxWidth().height(measuredHeightDp.dp)
        } else {
          Modifier.fillMaxWidth()
        }

    DisposableEffect(rowLogState) {
      debugLog("row mount data=[$debugDataKey] cell=${cell.debugLabel()}")
      onDispose {
        debugLog(
            "row unmount recompositions=${rowLogState.recompositionCount} " +
                "lastData=[${rowLogState.lastDataKey}] cell=${cell.debugLabel()}",
        )
      }
    }

    SideEffect {
      rowLogState.recompositionCount += 1
      val dataChanged = rowLogState.lastDataKey.isNotEmpty() && rowLogState.lastDataKey != debugDataKey
      debugLog(
          "row recompose#${rowLogState.recompositionCount} dataChanged=$dataChanged " +
              "data=[$debugDataKey] cell=${cell.debugLabel()}",
      )
      rowLogState.lastDataKey = debugDataKey
    }

    val reactionDescriptions =
        item
            ?.reactions
            ?.joinToString(separator = " ") { reaction ->
              "chat-reaction-$index-${reaction.name}-${reaction.count}"
            }
            .orEmpty()
    Box(
        modifier =
            Modifier.fillMaxWidth()
                .semantics {
                  testTag = cell.itemId
                  contentDescription =
                      "chat-row-$index-v${cell.renderVersion} " +
                          "chat-row-$index-item-${cell.itemId} " +
                          "chat-row-$index-fabric-${cell.itemId}-v${cell.renderVersion} " +
                          reactionDescriptions
                },
    ) {
      AndroidView(
          factory = { holderContext ->
            FabricCellHolder(holderContext).also { holder ->
              debugLog("holder factory data=[$debugDataKey] cell=${cell.debugLabel()}")
            }
          },
          modifier = androidViewModifier,
          update = { holder ->
            holder.preferredHeightDp = measuredHeightDp ?: 0
            holder.recordUpdate(debugDataKey, cell)
            attachFabricCellToHolder(holder, cell)
          },
          onReset = { holder ->
            holder.recordReset("reset")
            holder.removeAllViews()
          },
          onRelease = { holder ->
            holder.recordReset("release")
            holder.removeAllViews()
          },
      )
    }
  }

  @Composable
  private fun FastSkeletonRow(index: Int) {
    val template = placeholderTemplateForIndex(index)
    val own = isEndAligned(index, template)
    val rowHeight = max(72, template.height.takeIf { it > 0 } ?: 104)
    val bubbleWidth = placeholderWidth(index, template)

    Row(
        modifier = Modifier.fillMaxWidth().height(rowHeight.dp).padding(horizontal = 12.dp, vertical = 5.dp),
        horizontalArrangement = if (own) Arrangement.End else Arrangement.Start,
    ) {
      Box(
          modifier =
              Modifier.width(bubbleWidth.dp)
                  .height(max(1, rowHeight - 10).dp)
                  .background(Color(0xFFE5E7EB), RoundedCornerShape(14.dp)),
      )
    }
  }

  private fun attachFabricCellToHolder(holder: FabricCellHolder, cell: ComposeChatListItemView) {
    if (cell.parent === holder && holder.childCount == 1) {
      hostLog("holderAttachSkip holderChildren=${holder.childCount} ${cell.diagnosticLabel()}")
      fabricMountLog("holderAttachSkip ${cell.debugLabel()} holderChildren=${holder.childCount}")
      return
    }

    val startNs = SystemClock.elapsedRealtimeNanos()
    val previousParent = cell.parent
    (cell.parent as? ViewGroup)?.removeView(cell)
    holder.removeAllViews()
    holder.addView(
        cell,
        FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT,
        ),
    )
    hostLog(
        "holderAttach previousParent=${previousParent?.javaClass?.simpleName ?: "none"} " +
            "holderChildren=${holder.childCount} durationUs=${(SystemClock.elapsedRealtimeNanos() - startNs) / 1_000} " +
            cell.diagnosticLabel(),
    )
    fabricMountLog(
        "holderAttach ${cell.debugLabel()} previousParent=${previousParent?.javaClass?.simpleName ?: "none"} " +
            "holderChildren=${holder.childCount} durationUs=${(SystemClock.elapsedRealtimeNanos() - startNs) / 1_000}",
    )
  }

  @Composable
  private fun ChatRow(index: Int, item: RenderedChatItem?) {
    if (item == null) {
      FastSkeletonRow(index)
      return
    }

    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 5.dp),
        horizontalArrangement = if (item.isOwn) Arrangement.End else Arrangement.Start,
    ) {
      Column(
          modifier =
              Modifier.widthIn(max = 328.dp)
                  .semantics { contentDescription = "chat-row-$index-v${item.renderVersion}" }
                  .semantics { testTag = item.id }
                  .clip(RoundedCornerShape(14.dp))
                  .background(if (item.isOwn) Color(0xFF1D4ED8) else Color.White)
                  .padding(horizontal = 12.dp, vertical = 9.dp),
      ) {
        BasicText(
            text = item.author,
            style =
                TextStyle(
                    color = if (item.isOwn) Color(0xFFDCEAFE) else Color(0xFF475569),
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                ),
        )
        Box(
            modifier =
                Modifier.width(1.dp)
                    .height(1.dp)
                    .semantics { contentDescription = "chat-row-$index-item-${item.id}" },
        )
        Spacer(modifier = Modifier.height(3.dp))
        BasicText(
            text = item.body,
            style =
                TextStyle(
                    color = if (item.isOwn) Color.White else Color(0xFF111827),
                    fontSize = 15.sp,
                    lineHeight = 20.sp,
                ),
        )
        val reactions = item.reactions
        if (reactions.isNotEmpty()) {
          Spacer(modifier = Modifier.height(7.dp))
          ReactionBar(index = index, item = item, reactions = reactions)
        } else {
          Spacer(modifier = Modifier.height(7.dp))
          AddReactionButton(index = index, item = item)
        }
      }
    }
  }

  @Composable
  private fun ReactionBar(index: Int, item: RenderedChatItem, reactions: List<ChatReaction>) {
    Row(horizontalArrangement = Arrangement.spacedBy(5.dp)) {
      reactions.forEach { reaction ->
        Box(
            modifier =
                Modifier.clip(RoundedCornerShape(999.dp))
                    .semantics {
                      contentDescription =
                          "chat-reaction-$index-${reaction.name}-${reaction.count}"
                    }
                    .background(if (item.isOwn) Color(0xFF2563EB) else Color(0xFFF8FAFC))
                    .border(
                        width = 1.dp,
                        color = if (item.isOwn) Color(0xFF93C5FD) else Color(0xFFE2E8F0),
                        shape = RoundedCornerShape(999.dp),
                    )
                    .clickable { emitReaction(index, reaction.name) }
                    .padding(horizontal = 8.dp, vertical = 4.dp),
        ) {
          BasicText(
              text = "${reaction.label} ${reaction.count}",
              style =
                  TextStyle(
                      color = if (item.isOwn) Color.White else Color(0xFF334155),
                      fontSize = 12.sp,
                      fontWeight = FontWeight.SemiBold,
                  ),
          )
        }
      }
      AddReactionButton(index = index, item = item)
    }
  }

  @Composable
  private fun AddReactionButton(index: Int, item: RenderedChatItem) {
    Box(
        modifier =
            Modifier.clip(RoundedCornerShape(999.dp))
                .semantics { contentDescription = "chat-reaction-add-$index" }
                .background(if (item.isOwn) Color(0xFF1E40AF) else Color.White)
                .border(
                    width = 1.dp,
                    color = if (item.isOwn) Color(0xFF93C5FD) else Color(0xFFE2E8F0),
                    shape = RoundedCornerShape(999.dp),
                )
                .clickable { emitReaction(index, "like") }
                .padding(horizontal = 8.dp, vertical = 4.dp),
    ) {
      BasicText(
          text = "+",
          style =
              TextStyle(
                  color = if (item.isOwn) Color.White else Color(0xFF64748B),
                  fontSize = 12.sp,
                  fontWeight = FontWeight.Bold,
              ),
      )
    }
  }

  private fun requestItemsForWindow(indices: List<Int>, resetIndices: Set<Int> = emptySet()) {
    val activeIndices = indices.filter { it in 0 until itemCount }.distinct()
    visibleRequestWindow = activeIndices
    pruneToActiveWindow()
    pruneStalePendingRequests()
    val windowKey = activeIndices.joinToString(",")

    resetIndices.forEach { index ->
      if (index in 0 until itemCount) {
        dirtyRows.add(index)
        pendingRequests.remove(requestKey(dataVersion, index))
      }
    }

    val unresolved =
        activeIndices.filter { index ->
          index in 0 until itemCount &&
              (!renderedRows.containsKey(index) || dirtyRows.contains(index))
        }
    val missing =
        unresolved.filter { index ->
          val key = requestKey(dataVersion, index)
          if (!pendingRequests.containsKey(key)) {
            pendingRequests[key] = SystemClock.uptimeMillis()
            true
          } else {
            requestLog("skip pending version=$dataVersion index=$index window=[$windowKey]")
            false
          }
        }
    if (missing.isEmpty()) {
      if (unresolved.isNotEmpty()) {
        scheduleStaleRequestCheck()
      }
      if (unresolved.isEmpty() && windowKey != lastDispatchedWindowKey) {
        dispatchItemRequest(emptyList(), activeIndices, emptySet())
        lastDispatchedWindowKey = windowKey
      }
      return
    }

    dispatchItemRequest(missing, activeIndices, resetIndices)
    scheduleStaleRequestCheck()
    lastDispatchedWindowKey = windowKey
  }

  private fun dispatchItemRequest(
      missing: List<Int>,
      activeIndices: List<Int>,
      resetIndices: Set<Int>,
  ) {
    val nextRequestId = requestId++
    if (missing.isNotEmpty()) {
      pendingRequestBatches[nextRequestId] = missing
    }
    requestLog(
        "dispatch requestId=$nextRequestId version=$dataVersion " +
            "missing=[${missing.joinToString(",")}] window=[${activeIndices.joinToString(",")}] " +
            "reset=[${resetIndices.filter { it in missing }.joinToString(",")}]",
    )
    if (renderMode == "background") {
      configureBackgroundRuntime()
      BackgroundListRuntime.requestItems(
          listName,
          nextRequestId,
          dataVersion,
          missing,
          activeIndices,
          resetIndices.filter { it in missing },
      )
      return
    }

    val event = Arguments.createMap()
    event.putInt("requestId", nextRequestId)
    event.putInt("version", dataVersion)
    event.putString("indicesJson", missing.joinToString(","))
    event.putString("windowIndicesJson", activeIndices.joinToString(","))
    event.putString("resetIndicesJson", resetIndices.filter { it in missing }.joinToString(","))

    val reactContext = context as? ReactContext ?: return
    UIManagerHelper.getEventDispatcher(reactContext)
        ?.dispatchEvent(RequestItemsEvent(UIManagerHelper.getSurfaceId(this), id, event))
  }

  private fun renderWindowAround(index: Int): List<Int> =
      ((index - WINDOW_BEHIND)..(index + WINDOW_AHEAD)).filter { it in 0 until itemCount }

  private fun requestWindowFor(
      visibleIndices: List<Int>,
      useActiveScrollWindow: Boolean,
  ): List<Int> {
    val behind = if (useActiveScrollWindow) ACTIVE_SCROLL_WINDOW_BEHIND else WINDOW_BEHIND
    val ahead = if (useActiveScrollWindow) ACTIVE_SCROLL_WINDOW_AHEAD else WINDOW_AHEAD
    return visibleIndices
        .flatMap { index -> (index - behind)..(index + ahead) }
        .filter { it in 0 until itemCount }
        .distinct()
  }

  private fun activeWindowIncluding(index: Int): List<Int> {
    if (index in visibleRequestWindow) return visibleRequestWindow
    return (visibleRequestWindow + index).filter { it in 0 until itemCount }.distinct().sorted()
  }

  private fun pruneToActiveWindow() {
    val activeIndices = visibleRequestWindow.toSet()
    if (activeIndices.isEmpty()) return

    fabricCells.keys.toList().forEach { index ->
      if (index !in activeIndices) {
        removeFabricCellAt(index)
      }
    }
    fabricCellHeights.keys.toList().forEach { index ->
      if (index !in activeIndices) {
        removeFabricCellHeight(index)
      }
    }
    pendingRequests.keys.toList().forEach { key ->
      val version = key.substringBefore(':', "").toIntOrNull()
      if (version == null || version != dataVersion) {
        pendingRequests.remove(key)
      }
    }
    pendingRequestBatches.keys.toList().forEach { requestId ->
      if (pendingRequestBatches[requestId]?.isEmpty() != false) {
        pendingRequestBatches.remove(requestId)
      }
    }
  }

  private fun pruneStalePendingRequests() {
    val now = SystemClock.uptimeMillis()
    pendingRequests.keys.toList().forEach { key ->
      val requestedAt = pendingRequests[key] ?: return@forEach
      val version = key.substringBefore(':', "").toIntOrNull()
      if (version == null || version != dataVersion || now - requestedAt > STALE_REQUEST_MS) {
        pendingRequests.remove(key)
      }
    }
    val pendingKeys = pendingRequests.keys.toSet()
    pendingRequestBatches.keys.toList().forEach { requestId ->
      val remaining = pendingRequestBatches[requestId]
          ?.filter { index -> requestKey(dataVersion, index) in pendingKeys }
          .orEmpty()
      if (remaining.isEmpty()) {
        pendingRequestBatches.remove(requestId)
      } else {
        pendingRequestBatches[requestId] = remaining
      }
    }
  }

  private fun scheduleStaleRequestCheck() {
    if (staleRequestCheckScheduled || pendingRequests.isEmpty()) return

    staleRequestCheckScheduled = true
    postDelayed(
        {
          staleRequestCheckScheduled = false
          if (pendingRequests.isNotEmpty() && visibleRequestWindow.isNotEmpty()) {
            requestItemsForWindow(visibleRequestWindow)
          }
        },
        STALE_REQUEST_MS,
    )
  }

  private fun spacingStatusFor(layout: VisibleListLayout): String {
    val fullyVisibleItems =
        layout.items
            .filter { item ->
              item.offset >= layout.viewportStart && item.offset + item.size <= layout.viewportEnd
            }
            .sortedBy { item -> item.offset }

    if (fullyVisibleItems.size < 2) {
      return "visible-list-spacing-pending"
    }

    var expectedGap: Int? = null
    for (index in 0 until fullyVisibleItems.lastIndex) {
      val current = fullyVisibleItems[index]
      val next = fullyVisibleItems[index + 1]
      val gap = next.offset - (current.offset + current.size)
      if (gap < 0) {
        return "visible-list-spacing-overlap"
      }
      val previousGap = expectedGap
      if (previousGap == null) {
        expectedGap = gap
      } else if (abs(gap - previousGap) > 1) {
        return "visible-list-spacing-gap-mismatch"
      }
    }

    return "visible-list-spacing-ok-gap-${expectedGap ?: 0}"
  }

  private fun requestKey(version: Int, index: Int): String = "$version:$index"

  private fun scheduleInitialScrollIfNeeded() {
    if (initialScrollApplied || itemCount <= 0) return

    val targetIndex = min(max(initialIndexToRender, 0), itemCount - 1)
    initialScrollApplied = true
    pendingInitialScrollIndex = targetIndex
    visibleRequestWindow = renderWindowAround(targetIndex)
    requestItemsForWindow(visibleRequestWindow)
    initialScrollVersion += 1
  }

  private fun placeholderTemplateForIndex(index: Int): PlaceholderTemplate {
    val templates = placeholderSpec.templates.ifEmpty { PlaceholderSpec.Default.templates }
    return templates[index % templates.size]
  }

  private fun placeholderWidth(index: Int, template: PlaceholderTemplate): Int {
    val minWidth = max(48, min(template.minWidth, template.maxWidth))
    val maxWidth = max(minWidth, template.maxWidth)
    return minWidth + ((index * 37) % (maxWidth - minWidth + 1))
  }

  private fun isEndAligned(index: Int, template: PlaceholderTemplate): Boolean =
      when (template.align) {
        "end" -> true
        "alternate" -> index % 3 == 0
        else -> false
      }

  private fun emitReaction(index: Int, reaction: String) {
    applyOptimisticReaction(index, reaction)

    val event = Arguments.createMap()
    event.putInt("index", index)
    event.putString("reaction", reaction)

    val reactContext = context as? ReactContext ?: return
    UIManagerHelper.getEventDispatcher(reactContext)
        ?.dispatchEvent(ReactToItemEvent(UIManagerHelper.getSurfaceId(this), id, event))
  }

  private fun applyOptimisticReaction(index: Int, reaction: String) {
    val item = renderedRows[index] ?: return
    val current = item.reactions.associateBy { it.name }.toMutableMap()
    val existing = current[reaction]
    current[reaction] =
        ChatReaction(
            name = reaction,
            label = reactionLabel(reaction),
            count = (existing?.count ?: 0) + 1,
        )

    setRenderedRow(
        index,
        item.copy(
            reactionSummary = reactionSummary(current.values),
            reactionDetails = serializeReactions(current.values),
            reactions = current.values.toList(),
        ),
    )
  }

  private fun configureBackgroundRuntime() {
    if (renderMode != "background") return
    val themedContext = context as? ThemedReactContext ?: return

    BackgroundListRuntime.registerView(listName, this)
    if (backgroundRootView == null) {
      backgroundRootView =
          BackgroundListRuntime.createHiddenRoot(themedContext, backgroundAppName, listName).also {
            it.importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
            it.isClickable = false
            it.isFocusable = false
            addView(it, LayoutParams(LayoutParams.MATCH_PARENT, 1))
          }
    }
  }

  private fun requestParentsDoNotIntercept(view: View, disallowIntercept: Boolean) {
    var parent = view.parent
    while (parent != null) {
      parent.requestDisallowInterceptTouchEvent(disallowIntercept)
      parent = parent.parent
    }
  }

  override fun onDetachedFromWindow() {
    BackgroundListRuntime.unregisterView(listName, this)
    super.onDetachedFromWindow()
  }
}

private fun ReadableMap.optInt(key: String, fallback: Int): Int =
    if (hasKey(key) && !isNull(key)) {
      when (getType(key)) {
        ReadableType.Number -> getDouble(key).toInt()
        else -> fallback
      }
    } else {
      fallback
    }

private fun ReadableMap.optString(key: String, fallback: String): String =
    if (hasKey(key) && !isNull(key) && getType(key) == ReadableType.String) {
      getString(key) ?: fallback
    } else {
      fallback
    }

private fun ReadableMap.optBoolean(key: String, fallback: Boolean): Boolean =
    if (hasKey(key) && !isNull(key) && getType(key) == ReadableType.Boolean) {
      getBoolean(key)
    } else {
      fallback
    }

private fun ReadableMap.optArray(key: String): ReadableArray? =
    if (hasKey(key) && !isNull(key) && getType(key) == ReadableType.Array) getArray(key) else null

private fun ReadableMap.optMap(key: String): ReadableMap? =
    if (hasKey(key) && !isNull(key) && getType(key) == ReadableType.Map) getMap(key) else null

private fun parseReactions(details: String): List<ChatReaction> =
    details
        .split(",")
        .mapNotNull { part ->
          val pieces = part.split(":")
          if (pieces.size != 2) return@mapNotNull null
          val count = pieces[1].toIntOrNull() ?: return@mapNotNull null
          if (count <= 0) return@mapNotNull null
          ChatReaction(name = pieces[0], label = reactionLabel(pieces[0]), count = count)
        }

private fun reactionLabel(name: String): String =
    when (name) {
      "love" -> "<3"
      "laugh" -> ":D"
      "wow" -> "!"
      "fire" -> "*"
      else -> "+"
    }

private fun serializeReactions(reactions: Collection<ChatReaction>): String =
    reactions.joinToString(",") { "${it.name}:${it.count}" }

private fun messageContentType(isOwn: Boolean): String =
    if (isOwn) "message-own" else "message-other"

private fun reactionSummary(reactions: Collection<ChatReaction>): String =
    reactions.joinToString("   ") { "${it.label} ${it.count}" }

private fun reactionsFromPayload(payload: ReadableMap): List<ChatReaction> {
  val reactions = payload.optMap("reactions") ?: return emptyList()
  val iterator = reactions.keySetIterator()
  val nextReactions = mutableListOf<ChatReaction>()
  while (iterator.hasNextKey()) {
    val name = iterator.nextKey()
    val count =
        when {
          reactions.isNull(name) -> 0
          reactions.getType(name) == ReadableType.Number -> reactions.getDouble(name).toInt()
          else -> 0
        }
    if (count > 0) {
      nextReactions.add(ChatReaction(name = name, label = reactionLabel(name), count = count))
    }
  }
  return nextReactions
}

private fun parsePlaceholderSpec(spec: ReadableMap?): PlaceholderSpec {
  if (spec == null) return PlaceholderSpec.Default

  val defaultVariant = sanitizePlaceholderVariant(spec.optString("defaultVariant", "chat"))
  val templatesArray = spec.optArray("templates")
  val templates = mutableListOf<PlaceholderTemplate>()
  if (templatesArray != null) {
    for (i in 0 until templatesArray.size()) {
      val template = templatesArray.getMap(i) ?: continue
      templates.add(parsePlaceholderTemplate(i, defaultVariant, template))
    }
  }

  return PlaceholderSpec(
      version = spec.optInt("version", 1),
      defaultVariant = defaultVariant,
      templates = templates.ifEmpty { PlaceholderSpec.Default.templates },
  )
}

private fun parsePlaceholderTemplate(
    index: Int,
    defaultVariant: String,
    template: ReadableMap,
): PlaceholderTemplate =
    PlaceholderTemplate(
        key = template.optString("key", "placeholder-$index"),
        variant = sanitizePlaceholderVariant(template.optString("variant", defaultVariant)),
        align = sanitizePlaceholderAlign(template.optString("align", "alternate")),
        minWidth = template.optInt("minWidth", 176).coerceIn(48, 420),
        maxWidth = template.optInt("maxWidth", 302).coerceIn(48, 420),
        height = template.optInt("height", 56).coerceIn(0, 260),
        lines = template.optInt("lines", 2).coerceIn(1, 4),
        showAvatar = template.optBoolean("showAvatar", false),
        showFooter = template.optBoolean("showFooter", true),
    )

private fun sanitizePlaceholderVariant(variant: String): String =
    when (variant) {
      "card", "media", "compact" -> variant
      else -> "chat"
    }

private fun sanitizePlaceholderAlign(align: String): String =
    when (align) {
      "end", "alternate" -> align
      else -> "start"
    }
