import { useSyncExternalStore } from "react";
import {
  calculateGridPosition,
  COLLECTION_PADDING,
  GRID_COLUMNS,
  GRID_GAP,
} from "../utils/collection-utils";
import {
  getCollectionDragState,
  subscribeCollectionDragState,
} from "../hooks/useCollectionDragHandler";

export function CollectionDropIndicator({ collectionId }: { collectionId: string }) {
  const dragState = useSyncExternalStore(
    subscribeCollectionDragState,
    getCollectionDragState,
    getCollectionDragState
  );

  if (
    !dragState.isDragging ||
    dragState.targetCollectionId !== collectionId ||
    dragState.dropIndex === null
  ) {
    return null;
  }

  const effectiveColumns = Math.min(
    GRID_COLUMNS,
    Math.max(1, dragState.docCount || 1)
  );

  const { x, y } = calculateGridPosition(
    dragState.dropIndex,
    dragState.docWidth,
    dragState.docHeight,
    effectiveColumns,
    GRID_GAP,
    COLLECTION_PADDING
  );

  return (
    <div
      className="pointer-events-none absolute rounded-lg border-2 border-dashed border-blue-500/80 bg-blue-200/20"
      style={{
        left: x,
        top: y,
        width: dragState.docWidth,
        height: dragState.docHeight,
      }}
    />
  );
}
