import { useEffect } from "react";
import type { Editor } from "tldraw";
import {
  calculateGridCollectionSize,
  repositionDocumentsInGrid,
} from "../utils/collection-utils";
import {
  collectionProcessingState,
  getCollectionDragState,
} from "./useCollectionDragHandler";

export function useCollectionAutoSize(editor: Editor | null) {
  useEffect(() => {
    if (!editor) return;

    const defaultDocSize = { w: 300, h: 180 };

    const runAutoSize = () => {
      const collections = editor
        .getCurrentPageShapes()
        .filter((shape) => shape.type === "collection");

      collections.forEach((shape) => {
        const collection = editor.getShape(shape.id);
        if (!collection || collection.type !== "collection") return;
        
        // Clean up stale/duplicate documentIds - only keep documents that are actually children
        const validDocumentIds = [...new Set(collection.props.documentIds)].filter((id) => {
          const doc = editor.getShape(id);
          return doc && doc.type === "document" && doc.parentId === collection.id;
        });

        // Update documentIds if they changed (removed stale/duplicates)
        const idsChanged = validDocumentIds.length !== collection.props.documentIds.length ||
          !validDocumentIds.every((id, i) => id === collection.props.documentIds[i]);

        const documentShapes = validDocumentIds
          .map((id) => editor.getShape(id))
          .filter((doc) => doc?.type === "document");

        const docSize = documentShapes[0]?.props ?? defaultDocSize;
        const { w, h } = calculateGridCollectionSize(
          validDocumentIds.length,
          docSize.w,
          docSize.h
        );

        const needsSizeUpdate = collection.props.w !== w || collection.props.h !== h;
        
        if (idsChanged || needsSizeUpdate) {
          editor.updateShapes([
            {
              id: collection.id,
              type: "collection",
              props: { 
                ...collection.props, 
                w, 
                h,
                documentIds: validDocumentIds,
              },
            },
          ]);
        }

        repositionDocumentsInGrid(editor, collection.id);
      });
    };

    const unsubscribe = editor.store.listen(() => {
      // Skip if actively processing or dragging
      if (
        collectionProcessingState.isProcessing ||
        getCollectionDragState().isDragging ||
        editor.inputs?.isDragging ||
        editor.inputs?.pointerIsDown
      ) {
        return;
      }

      runAutoSize();
    });

    return () => {
      unsubscribe();
    };
  }, [editor]);
}
