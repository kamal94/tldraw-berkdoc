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

    let isUpdating = false;
    const defaultDocSize = { w: 300, h: 180 };
    const unsubscribe = editor.store.listen(() => {
      if (
        isUpdating ||
        collectionProcessingState.isProcessing ||
        getCollectionDragState().isDragging
      ) {
        return;
      }
      isUpdating = true;

      const collections = editor
        .getCurrentPageShapes()
        .filter((shape) => shape.type === "collection");

      collections.forEach((shape) => {
        const collection = editor.getShape(shape.id);
        if (!collection || collection.type !== "collection") return;

        const documentShapes = collection.props.documentIds
          .map((id) => editor.getShape(id))
          .filter((doc) => doc?.type === "document");

        const docSize = documentShapes[0]?.props ?? defaultDocSize;
        const { w, h } = calculateGridCollectionSize(
          collection.props.documentIds.length,
          docSize.w,
          docSize.h
        );

        if (collection.props.w !== w || collection.props.h !== h) {
          editor.updateShapes([
            {
              id: collection.id,
              type: "collection",
              props: { ...collection.props, w, h },
            },
          ]);
        }

        repositionDocumentsInGrid(editor, collection.id);
      });
      isUpdating = false;
    });

    return () => {
      unsubscribe();
    };
  }, [editor]);
}
