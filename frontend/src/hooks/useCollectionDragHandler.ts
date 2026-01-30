import { useEffect, useRef } from "react";
import type { Editor, TLShape } from "tldraw";
import type { TLShapeId, TLParentId } from "@tldraw/tlschema";
import type { CollectionShape } from "../shapes/CollectionShape";
import type { CollectionShapeProps } from "@shared/document-shape.types";
import {
  calculateGridPosition,
  calculateGridCollectionSize,
  getDropIndexFromPosition,
} from "../utils/collection-utils";

type Point = { x: number; y: number };

function isCollectionShape(shape: TLShape | undefined): shape is CollectionShape {
  return Boolean(shape && shape.type === "collection");
}

function getDocumentPageBounds(editor: Editor, shape: TLShape) {
  return editor.getShapePageBounds(shape);
}

function isPointInCollectionBounds(
  editor: Editor,
  collection: CollectionShape,
  point: Point
): boolean {
  const bounds = editor.getShapePageBounds(collection);
  if (!bounds) return false;
  return (
    point.x >= bounds.minX &&
    point.x <= bounds.maxX &&
    point.y >= bounds.minY &&
    point.y <= bounds.maxY
  );
}

function getEffectiveColumns(documentCount: number, maxColumns = 3) {
  return Math.min(maxColumns, Math.max(1, documentCount));
}

function findCollectionAtPoint(
  editor: Editor,
  point: Point,
  excludeCollectionId?: string
): CollectionShape | null {
  const collections = editor
    .getCurrentPageShapes()
    .filter(isCollectionShape)
    .filter((shape) => (excludeCollectionId ? shape.id !== excludeCollectionId : true));

  return (
    collections.find((collection) => isPointInCollectionBounds(editor, collection, point)) ?? null
  );
}

// Shared flag to coordinate between drag handler and auto-size hooks
export const collectionProcessingState = {
  isProcessing: false,
};

export type CollectionDragState = {
  isDragging: boolean;
  sourceCollectionId: TLShapeId | null;
  targetCollectionId: TLShapeId | null;
  dropIndex: number | null;
  docWidth: number;
  docHeight: number;
  docCount: number;
};

const defaultDragState: CollectionDragState = {
  isDragging: false,
  sourceCollectionId: null,
  targetCollectionId: null,
  dropIndex: null,
  docWidth: 300,
  docHeight: 180,
  docCount: 0,
};

const dragStateStore = {
  state: defaultDragState,
  listeners: new Set<() => void>(),
  setState(partial: Partial<CollectionDragState>) {
    this.state = { ...this.state, ...partial };
    this.listeners.forEach((listener) => listener());
  },
  reset() {
    this.state = defaultDragState;
    this.listeners.forEach((listener) => listener());
  },
};

export function subscribeCollectionDragState(listener: () => void) {
  dragStateStore.listeners.add(listener);
  return () => dragStateStore.listeners.delete(listener);
}

export function getCollectionDragState() {
  return dragStateStore.state;
}

export function useCollectionDragHandler(editor: Editor | null) {
  const isProcessingRef = useRef(false);

  useEffect(() => {
    if (!editor) return;

    const updateDragState = (nextState: Partial<CollectionDragState>) => {
      dragStateStore.setState(nextState);
    };

    const clearDragState = () => {
      dragStateStore.reset();
    };

    const getPointerPagePoint = () => {
      return editor.inputs?.currentPagePoint ?? null;
    };

    const getSingleSelectedDocument = () => {
      const selected = editor.getSelectedShapes().filter((s) => s.type === "document");
      return selected.length === 1 ? selected[0] : null;
    };

    const getCollectionDropIndex = (
      collection: CollectionShape,
      point: Point,
      docSize: { w: number; h: number },
      excludeDocumentId?: TLShapeId
    ) => {
      const bounds = editor.getShapePageBounds(collection);
      if (!bounds) return null;

      const localX = point.x - bounds.minX;
      const localY = point.y - bounds.minY;

      const totalDocs = excludeDocumentId
        ? collection.props.documentIds.filter((id) => id !== excludeDocumentId).length
        : collection.props.documentIds.length;

      return getDropIndexFromPosition(
        localX,
        localY,
        totalDocs,
        docSize.w,
        docSize.h
      );
    };

    const handlePointerUp = () => {
      if (isProcessingRef.current || collectionProcessingState.isProcessing) return;

      const docShape = getSingleSelectedDocument();
      if (!docShape) {
        clearDragState();
        return;
      }

      const pageId = editor.getCurrentPageId();
      const pointer = getPointerPagePoint();
      if (!pointer) {
        clearDragState();
        return;
      }

      const docBounds = getDocumentPageBounds(editor, docShape);
      if (!docBounds) {
        clearDragState();
        return;
      }

      const docSize = { w: docShape.props.w, h: docShape.props.h };
      
      // Use tracked sourceCollectionId from drag state (set during pointer_move)
      // This is more reliable than checking parentId which may have changed
      const trackedSourceId = dragStateStore.state.sourceCollectionId;
      const parentShape = editor.getShape(docShape.parentId);
      const parentCollection = isCollectionShape(parentShape) ? parentShape : null;
      
      // Prefer the tracked source, fall back to current parent
      const sourceCollection = trackedSourceId 
        ? (editor.getShape(trackedSourceId) as CollectionShape | undefined) ?? parentCollection
        : parentCollection;
      const targetCollection = findCollectionAtPoint(editor, pointer);

      if (!sourceCollection && !targetCollection) {
        clearDragState();
        return;
      }

      isProcessingRef.current = true;
      collectionProcessingState.isProcessing = true;

      try {
        if (sourceCollection && !targetCollection) {
          const newDocumentIds = sourceCollection.props.documentIds.filter(
            (id) => id !== docShape.id
          );

          // Calculate new size for source collection after removing the document
          const newSize = calculateGridCollectionSize(
            newDocumentIds.length,
            docSize.w,
            docSize.h
          );

          editor.reparentShapes([docShape.id], pageId as TLParentId);
          editor.updateShapes([
            {
              id: docShape.id,
              type: "document",
              x: docBounds.minX,
              y: docBounds.minY,
            },
            {
              id: sourceCollection.id,
              type: "collection",
              props: {
                ...sourceCollection.props,
                documentIds: newDocumentIds,
                w: newSize.w,
                h: newSize.h,
              } as CollectionShapeProps,
            },
          ]);
        } else if (targetCollection && sourceCollection?.id === targetCollection.id) {
          const currentIds = sourceCollection.props.documentIds;
          const sourceIndex = currentIds.indexOf(docShape.id);
          if (sourceIndex === -1) return;

          const dropIndex =
            getCollectionDropIndex(sourceCollection, pointer, docSize, docShape.id) ??
            sourceIndex;

          const reordered = currentIds.filter((id) => id !== docShape.id);
          reordered.splice(dropIndex, 0, docShape.id);

          const effectiveColumns = getEffectiveColumns(reordered.length);
          const position = calculateGridPosition(
            dropIndex,
            docSize.w,
            docSize.h,
            effectiveColumns
          );
          editor.updateShapes([
            {
              id: sourceCollection.id,
              type: "collection",
              props: {
                ...sourceCollection.props,
                documentIds: reordered,
              } as CollectionShapeProps,
            },
            {
              id: docShape.id,
              type: "document",
              x: position.x,
              y: position.y,
            },
          ]);
        } else if (targetCollection) {
          const targetDropIndex =
            getCollectionDropIndex(targetCollection, pointer, docSize) ??
            targetCollection.props.documentIds.length;

          // Remove any existing entry first to prevent duplicates, then add at new position
          const targetIds = targetCollection.props.documentIds.filter(
            (id) => id !== docShape.id
          );
          targetIds.splice(targetDropIndex, 0, docShape.id);

          // Calculate new size for target collection after adding the document
          const targetSize = calculateGridCollectionSize(
            targetIds.length,
            docSize.w,
            docSize.h
          );

          const updates = [
            {
              id: targetCollection.id,
              type: "collection",
              props: {
                ...targetCollection.props,
                documentIds: targetIds,
                w: targetSize.w,
                h: targetSize.h,
              } as CollectionShapeProps,
            },
          ];

          if (sourceCollection) {
            const sourceIds = sourceCollection.props.documentIds.filter(
              (id) => id !== docShape.id
            );
            // Calculate new size for source collection after removing the document
            const sourceSize = calculateGridCollectionSize(
              sourceIds.length,
              docSize.w,
              docSize.h
            );
            updates.push({
              id: sourceCollection.id,
              type: "collection",
              props: {
                ...sourceCollection.props,
                documentIds: sourceIds,
                w: sourceSize.w,
                h: sourceSize.h,
              } as CollectionShapeProps,
            });
          }

          editor.reparentShapes([docShape.id], targetCollection.id as TLParentId);
          const effectiveColumns = getEffectiveColumns(targetIds.length);
          const position = calculateGridPosition(
            targetDropIndex,
            docSize.w,
            docSize.h,
            effectiveColumns
          );
          editor.updateShapes([
            ...updates,
            {
              id: docShape.id,
              type: "document",
              x: position.x,
              y: position.y,
            },
          ]);
        }
      } finally {
        clearDragState();
        // Use requestAnimationFrame instead of setTimeout for faster state reset
        // Size is now updated directly, so we don't need to wait for auto-size
        requestAnimationFrame(() => {
          isProcessingRef.current = false;
          collectionProcessingState.isProcessing = false;
        });
      }
    };

    // Listen to editor events
    const removePointerUpListener = editor.on("event", (event) => {
      if (event.name === "pointer_up") {
        // Use requestAnimationFrame to ensure shape positions are finalized
        requestAnimationFrame(() => {
          handlePointerUp();
        });
      }
      if (event.name === "pointer_move") {
        const docShape = getSingleSelectedDocument();
        const pointer = getPointerPagePoint();
        const isDragging = editor.inputs?.isDragging ?? editor.inputs?.pointerIsDown ?? false;

        if (!docShape || !pointer || !isDragging) {
          clearDragState();
          return;
        }

        // Only determine source collection ONCE at the start of drag
        // After that, keep using the tracked value
        const currentState = dragStateStore.state;
        let sourceCollectionId = currentState.sourceCollectionId;
        
        if (!currentState.isDragging) {
          // First move of this drag - capture source collection
          const parentShape = editor.getShape(docShape.parentId);
          const sourceCollection = isCollectionShape(parentShape) ? parentShape : null;
          sourceCollectionId = sourceCollection?.id ?? null;
        }

        const targetCollection = findCollectionAtPoint(editor, pointer);

        if (!targetCollection) {
          updateDragState({
            isDragging: true,
            sourceCollectionId,
            targetCollectionId: null,
            dropIndex: null,
            docWidth: docShape.props.w,
            docHeight: docShape.props.h,
            docCount: 0,
          });
          return;
        }

        const docCount =
          sourceCollectionId === targetCollection.id
            ? targetCollection.props.documentIds.filter((id) => id !== docShape.id).length
            : targetCollection.props.documentIds.length;

        const dropIndex = getCollectionDropIndex(
          targetCollection,
          pointer,
          { w: docShape.props.w, h: docShape.props.h },
          sourceCollectionId === targetCollection.id ? docShape.id : undefined
        );

        updateDragState({
          isDragging: true,
          sourceCollectionId,
          targetCollectionId: targetCollection.id,
          dropIndex,
          docWidth: docShape.props.w,
          docHeight: docShape.props.h,
          docCount,
        });
      }
    });

    return () => {
      removePointerUpListener();
    };
  }, [editor]);
}
