import { useEffect } from "react";
import type { Editor } from "tldraw";
import { updateCollectionSize } from "../utils/collection-utils";

export function useCollectionAutoSize(editor: Editor | null) {
  useEffect(() => {
    if (!editor) return;

    let isUpdating = false;
    const unsubscribe = editor.store.listen(() => {
      if (isUpdating) return;
      isUpdating = true;

      const collections = editor
        .getCurrentPageShapes()
        .filter((shape) => shape.type === "collection");

      collections.forEach((shape) => updateCollectionSize(editor, shape.id));
      isUpdating = false;
    });

    return () => {
      unsubscribe();
    };
  }, [editor]);
}
