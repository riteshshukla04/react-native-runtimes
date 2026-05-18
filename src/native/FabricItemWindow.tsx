import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import {View} from 'react-native';
import {
  ComposeChatListItemNativeComponent,
  type ComposeChatListDataOp,
  type RenderedChatItem,
} from './ComposeChatListNativeComponent';

export type FabricItemRenderInfo = {
  item: RenderedChatItem;
  index: number;
};

export type FabricItemWindowRenderer = (
  info: FabricItemRenderInfo,
) => ReactElement | null;

const MAX_FABRIC_ITEMS = 48;
const MIN_RECYCLE_SLOTS_PER_TYPE = 0;

export function useFabricItemWindow() {
  const [items, setItems] = useState<RenderedChatItem[]>([]);
  const reset = useCallback(() => {
    setItems([]);
  }, []);
  const applyOps = useCallback((ops: ComposeChatListDataOp[]) => {
    setItems(previousItems => applyFabricDataOps(previousItems, ops));
  }, []);
  const mergeItems = useCallback(
    (nextItems: RenderedChatItem[], windowIndices?: number[]) => {
      setItems(previousItems =>
        mergeFabricItems(previousItems, nextItems, windowIndices),
      );
    },
    [],
  );

  return {
    items,
    reset,
    applyOps,
    mergeItems,
  };
}

export function FabricItemWindow({
  items,
  renderItem,
}: {
  items: RenderedChatItem[];
  keyExtractor?: (item: RenderedChatItem, index: number) => string;
  renderItem: FabricItemWindowRenderer;
}) {
  const renderCountRef = useRef(0);
  const [poolSizes, setPoolSizes] = useState<Record<string, number>>({});
  const slotAssignmentsRef = useRef<Record<string, Array<string | null>>>({});
  renderCountRef.current += 1;

  useEffect(() => {
    const typeCounts = countItemsByType(items);
    setPoolSizes(previousSizes => {
      const nextSizes = {...previousSizes};
      let didChange = false;

      for (const [type, count] of Object.entries(typeCounts)) {
        const nextSize = Math.max(
          previousSizes[type] ?? 0,
          count,
          MIN_RECYCLE_SLOTS_PER_TYPE,
        );
        if (nextSizes[type] !== nextSize) {
          nextSizes[type] = nextSize;
          didChange = true;
        }
      }

      return didChange ? capPoolSizes(nextSizes, typeCounts) : previousSizes;
    });
  }, [items]);

  const renderCells = assignStickySlots(
    slotAssignmentsRef.current,
    groupItemsByType(items),
    poolSizes,
  );
  logReactRender(
    `FabricItemWindow render#${renderCountRef.current} items=[${items
      .map(item => `${item.index}:${item.id}:v${item.renderVersion}`)
      .join(',')}] cells=[${renderCells
      .map(({item, slot, type}) => `${type}:${slot}->${item.index}:${item.id}`)
      .join(',')}] poolSizes=${JSON.stringify(poolSizes)}`,
  );

  return (
    <>
      {renderCells.map(({item, slot, type}) => {
        const hostSlot = `${type}:${slot}`;
        const messagePreview = `${item.author}: ${item.body.slice(0, 80)}`;
        return (
          <FabricItemCell
            contentType={type}
            hostSlot={hostSlot}
            item={item}
            itemId={item.id}
            itemIndex={item.index}
            key={`${type}:${slot}`}
            messagePreview={messagePreview}
            renderItem={renderItem}
          />
        );
      })}
    </>
  );
}

const FabricItemCell = memo(
  function FabricItemCell({
    contentType,
    hostSlot,
    item,
    itemId,
    itemIndex,
    messagePreview,
    renderItem,
  }: {
    contentType: string;
    hostSlot: string;
    item: RenderedChatItem;
    itemId: string;
    itemIndex: number;
    messagePreview: string;
    renderItem: FabricItemWindowRenderer;
  }) {
    const renderCountRef = useRef(0);
    renderCountRef.current += 1;
    logReactRender(
      `FabricItemCell render#${renderCountRef.current} slot=${hostSlot} ` +
        `index=${itemIndex} itemId=${itemId} renderVersion=${item.renderVersion} ` +
        `type=${contentType}`,
    );

    useEffect(() => {
      logReactRender(
        `FabricItemCell mount slot=${hostSlot} index=${itemIndex} itemId=${itemId} ` +
          `renderVersion=${item.renderVersion} type=${contentType}`,
      );
      return () => {
        logReactRender(
          `FabricItemCell unmount slot=${hostSlot} index=${itemIndex} itemId=${itemId} ` +
            `renderVersion=${item.renderVersion} type=${contentType}`,
        );
      };
    }, [contentType, hostSlot, item.renderVersion, itemId, itemIndex]);

    return (
      <ComposeChatListItemNativeComponent
        contentType={contentType}
        hostSlot={hostSlot}
        itemId={itemId}
        itemIndex={itemIndex}
        messagePreview={messagePreview}
        renderVersion={item.renderVersion}
        style={fabricItemHostStyle}>
        <View collapsable={false} style={fabricItemHostStyle}>
          {renderItem({item, index: item.index})}
        </View>
      </ComposeChatListItemNativeComponent>
    );
  },
  (previous, next) => {
    const equal =
      previous.contentType === next.contentType &&
      previous.hostSlot === next.hostSlot &&
      previous.item === next.item &&
      previous.itemId === next.itemId &&
      previous.itemIndex === next.itemIndex &&
      previous.messagePreview === next.messagePreview;
    if (!equal) {
      logReactRender(
        `FabricItemCell rerender slot=${previous.hostSlot}->${next.hostSlot} ` +
          `index=${previous.itemIndex}->${next.itemIndex} itemId=${previous.itemId}->${next.itemId} ` +
          `version=${previous.item.renderVersion}->${next.item.renderVersion} ` +
          `type=${previous.contentType}->${next.contentType}`,
      );
    }
    return equal;
  },
);

export function maxDataOpSeq(ops: ComposeChatListDataOp[]) {
  return ops.reduce((maxSeq, op) => Math.max(maxSeq, op.seq), 0);
}

export function parseIndexList(indicesJson: string) {
  return indicesJson
    .split(',')
    .filter(value => value.length > 0)
    .map(value => Number(value))
    .filter(Number.isFinite);
}

function mergeFabricItems(
  previousItems: RenderedChatItem[],
  nextItems: RenderedChatItem[],
  windowIndices?: number[],
) {
  const allowedIndices =
    windowIndices && windowIndices.length > 0 ? new Set(windowIndices) : null;
  const merged = new Map(previousItems.map(item => [item.index, item]));
  for (const item of nextItems) {
    merged.set(item.index, item);
  }

  return Array.from(merged.values())
    .filter(item => allowedIndices == null || allowedIndices.has(item.index))
    .sort((left, right) => left.index - right.index)
    .slice(0, MAX_FABRIC_ITEMS);
}

function groupItemsByType(items: RenderedChatItem[]) {
  const itemsByType = new Map<string, RenderedChatItem[]>();
  for (const item of items) {
    const typedItems = itemsByType.get(item.type);
    if (typedItems == null) {
      itemsByType.set(item.type, [item]);
    } else {
      typedItems.push(item);
    }
  }
  return itemsByType;
}

function countItemsByType(items: RenderedChatItem[]) {
  const counts: Record<string, number> = {};
  for (const item of items) {
    counts[item.type] = (counts[item.type] ?? 0) + 1;
  }
  return counts;
}

function assignStickySlots(
  assignmentsByType: Record<string, Array<string | null>>,
  itemsByType: Map<string, RenderedChatItem[]>,
  poolSizes: Record<string, number>,
) {
  const activeCells: Array<{
    type: string;
    slot: number;
    item: RenderedChatItem;
  }> = [];
  const allTypes = new Set([
    ...Object.keys(poolSizes),
    ...Array.from(itemsByType.keys()),
  ]);

  for (const type of Array.from(allTypes).sort()) {
    const typedItems = itemsByType.get(type) ?? [];
    const typedItemsById = new Map(typedItems.map(item => [item.id, item]));
    const activeIds = new Set(typedItemsById.keys());
    const slotCount = Math.max(poolSizes[type] ?? 0, typedItems.length);
    const assignments = assignmentsByType[type] ?? [];

    while (assignments.length < slotCount) {
      assignments.push(null);
    }

    for (let slot = 0; slot < assignments.length; slot += 1) {
      const assignedId = assignments[slot];
      if (assignedId != null && !activeIds.has(assignedId)) {
        assignments[slot] = null;
      }
    }

    const assignedIds = new Set(assignments.filter(id => id != null));
    for (const item of typedItems) {
      if (assignedIds.has(item.id)) {
        continue;
      }

      let freeSlot = assignments.findIndex(assignedId => assignedId == null);
      if (freeSlot < 0) {
        freeSlot = assignments.length;
        assignments.push(null);
      }
      assignments[freeSlot] = item.id;
      assignedIds.add(item.id);
    }

    assignmentsByType[type] = assignments;
    for (let slot = 0; slot < assignments.length; slot += 1) {
      const assignedId = assignments[slot];
      const item = assignedId == null ? null : typedItemsById.get(assignedId) ?? null;
      if (item != null) {
        activeCells.push({type, slot, item});
      }
    }
  }

  return activeCells.slice(0, MAX_FABRIC_ITEMS);
}

function capPoolSizes(
  sizes: Record<string, number>,
  activeCounts: Record<string, number>,
) {
  const entries = Object.entries(sizes).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  const cappedSizes: Record<string, number> = {};
  let remaining = MAX_FABRIC_ITEMS;

  for (let index = 0; index < entries.length; index += 1) {
    const [type, size] = entries[index];
    const remainingTypes = entries.length - index - 1;
    const activeCount = activeCounts[type] ?? 0;
    const cappedSize = Math.min(size, remaining - remainingTypes);
    cappedSizes[type] = Math.max(0, Math.max(activeCount, cappedSize));
    remaining -= cappedSizes[type];
  }

  return cappedSizes;
}

function applyFabricDataOps(
  previousItems: RenderedChatItem[],
  ops: ComposeChatListDataOp[],
) {
  let nextItems = previousItems;

  for (const op of ops) {
    switch (op.type) {
      case 'insert':
        nextItems = nextItems.map(item =>
          item.index >= op.index
            ? {...item, index: item.index + op.count}
            : item,
        );
        break;
      case 'remove':
        nextItems = nextItems
          .filter(
            item => item.index < op.index || item.index >= op.index + op.count,
          )
          .map(item =>
            item.index >= op.index + op.count
              ? {...item, index: item.index - op.count}
              : item,
          );
        break;
      case 'swapPairs':
        nextItems = nextItems.map(item => {
          if (item.index < op.index || item.index >= op.index + op.count) {
            return item;
          }

          const offset = item.index - op.index;
          return {
            ...item,
            index: item.index + (offset % 2 === 0 ? 1 : -1),
          };
        });
        break;
      case 'reset':
        nextItems = [];
        break;
      case 'update':
        break;
    }
  }

  return nextItems
    .sort((left, right) => left.index - right.index)
    .slice(0, MAX_FABRIC_ITEMS);
}

const fabricItemHostStyle = {
  display: 'flex' as const,
  width: '100%' as const,
};

function logReactRender(message: string) {
  // Intentionally visible in logcat under ReactNativeJS for release perf debugging.
  console.log(`[FabricReactRender] ${message}`);
}
