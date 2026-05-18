import {useCallback, useEffect, useRef, useState, type ReactElement} from 'react';
import {View, type LayoutChangeEvent, type ViewStyle} from 'react-native';
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
const MIN_RECYCLE_SLOTS_PER_TYPE = 24;

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
  const [itemHeights, setItemHeights] = useState<Record<string, number>>({});
  const [poolSizes, setPoolSizes] = useState<Record<string, number>>({});
  const slotAssignmentsRef = useRef<Record<string, Array<string | null>>>({});

  useEffect(() => {
    const activeItemIds = new Set(items.map(item => item.id));
    setItemHeights(previousHeights => {
      const nextHeights = Object.fromEntries(
        Object.entries(previousHeights).filter(([itemId]) =>
          activeItemIds.has(itemId),
        ),
      );
      return Object.keys(nextHeights).length === Object.keys(previousHeights).length
        ? previousHeights
        : nextHeights;
    });
  }, [items]);

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

  function handleItemLayout(item: RenderedChatItem, event: LayoutChangeEvent) {
    const height = Math.ceil(event.nativeEvent.layout.height);
    if (height <= 0) {
      return;
    }

    setItemHeights(previousHeights => {
      if (previousHeights[item.id] === height) {
        return previousHeights;
      }
      return {...previousHeights, [item.id]: height};
    });
  }

  const renderCells = assignStickySlots(
    slotAssignmentsRef.current,
    groupItemsByType(items),
    poolSizes,
  );

  return (
    <>
      {renderCells.map(({item, slot, type}) => {
        const hostSlot = `${type}:${slot}`;
        const itemId = item?.id ?? `pool:${hostSlot}`;
        const itemIndex = item?.index ?? -1;
        const measuredHeight = item == null ? 0 : itemHeights[item.id] ?? 0;
        const messagePreview =
          item == null ? 'inactive' : `${item.author}: ${item.body.slice(0, 80)}`;
        return (
          <ComposeChatListItemNativeComponent
            contentType={type}
            hostSlot={hostSlot}
            itemId={itemId}
            itemIndex={itemIndex}
            key={`${type}:${slot}`}
            measuredHeight={measuredHeight}
            messagePreview={messagePreview}
            renderVersion={item?.renderVersion ?? 0}
            style={item == null ? inactiveFabricItemHostStyle : fabricItemHostStyle}>
            <View
              collapsable={false}
              onLayout={event => {
                if (item != null) {
                  handleItemLayout(item, event);
                }
              }}
              style={item == null ? inactiveFabricItemHostStyle : fabricItemHostStyle}>
              {item == null ? null : renderItem({item, index: item.index})}
            </View>
          </ComposeChatListItemNativeComponent>
        );
      })}
    </>
  );
}

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
  const inactiveCells: Array<{
    type: string;
    slot: number;
    item: RenderedChatItem | null;
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
      if (item == null) {
        inactiveCells.push({type, slot, item: null});
      } else {
        activeCells.push({type, slot, item});
      }
    }
  }

  if (activeCells.length >= MAX_FABRIC_ITEMS) {
    return activeCells.slice(0, MAX_FABRIC_ITEMS);
  }

  return [
    ...activeCells,
    ...inactiveCells.slice(0, MAX_FABRIC_ITEMS - activeCells.length),
  ];
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

const inactiveFabricItemHostStyle: ViewStyle = {
  display: 'none',
  width: '100%',
};
