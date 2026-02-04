import {
  DefaultContextMenu,
  DefaultContextMenuContent,
  TldrawUiMenuGroup,
  TldrawUiMenuItem,
  type TLUiContextMenuProps,
  useEditor,
} from "tldraw";
import { createCollection } from "../utils/collection-utils";

export function BoardContextMenu(props: TLUiContextMenuProps) {
  const editor = useEditor();

  const handleCreateCollection = () => {
    if (!editor) return;

    const selectedDocuments = editor
      .getSelectedShapes()
      .filter((shape) => shape.type === "document")
      .map((shape) => shape.id);

    createCollection(editor, { documentIds: selectedDocuments });
  };

  return (
    <DefaultContextMenu {...props}>
      <TldrawUiMenuGroup id="collections">
        <TldrawUiMenuItem
          id="create-collection"
          icon="plus"
          label="Create collection"
          onSelect={handleCreateCollection}
        />
      </TldrawUiMenuGroup>
      <DefaultContextMenuContent />
    </DefaultContextMenu>
  );
}
