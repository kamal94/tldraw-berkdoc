import type { Editor } from "tldraw";
import { createShapeId } from "tldraw";
import { toRichText } from "@tldraw/tlschema";
import type { DocumentShape } from "../shapes/DocumentShape";
import type { CollectionShape } from "../shapes/CollectionShape";

type CollectionBounds = { x: number; y: number; w: number; h: number };

export type CreateCollectionOptions = {
  label?: string;
  documentIds?: string[];
  padding?: number;
};

const DEFAULT_COLLECTION_SIZE = { w: 600, h: 400 };

function isDocumentShape(shape: unknown): shape is DocumentShape {
  return Boolean(shape && (shape as { type?: string }).type === "document");
}

function isCollectionShape(shape: unknown): shape is CollectionShape {
  return Boolean(shape && (shape as { type?: string }).type === "collection");
}

function getCollectionShape(editor: Editor, collectionId: string) {
  const shape = editor.getShape(collectionId);
  if (!isCollectionShape(shape)) return null;
  return shape;
}

function getDocumentShape(editor: Editor, documentId: string) {
  const shape = editor.getShape(documentId);
  if (!isDocumentShape(shape)) return null;
  return shape;
}

function getViewportCenter(editor: Editor) {
  const bounds = editor.getViewportPageBounds();
  return { x: bounds.midX, y: bounds.midY };
}

export function calculateCollectionBounds(
  documents: DocumentShape[],
  padding = 40,
  editor?: Editor
): CollectionBounds {
  if (documents.length === 0) {
    return {
      x: -DEFAULT_COLLECTION_SIZE.w / 2,
      y: -DEFAULT_COLLECTION_SIZE.h / 2,
      w: DEFAULT_COLLECTION_SIZE.w,
      h: DEFAULT_COLLECTION_SIZE.h,
    };
  }

  const bounds = documents.reduce(
    (acc, doc) => {
      const pageBounds = editor?.getShapePageBounds?.(doc);
      if (pageBounds) {
        return {
          minX: Math.min(acc.minX, pageBounds.minX),
          minY: Math.min(acc.minY, pageBounds.minY),
          maxX: Math.max(acc.maxX, pageBounds.maxX),
          maxY: Math.max(acc.maxY, pageBounds.maxY),
        };
      }

      return {
        minX: Math.min(acc.minX, doc.x),
        minY: Math.min(acc.minY, doc.y),
        maxX: Math.max(acc.maxX, doc.x + doc.props.w),
        maxY: Math.max(acc.maxY, doc.y + doc.props.h),
      };
    },
    {
      minX: Number.POSITIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
    }
  );

  return {
    x: bounds.minX - padding,
    y: bounds.minY - padding,
    w: bounds.maxX - bounds.minX + padding * 2,
    h: bounds.maxY - bounds.minY + padding * 2,
  };
}

export function createCollection(editor: Editor, options: CreateCollectionOptions = {}) {
  const label = options.label ?? "New Collection";
  const padding = options.padding ?? 40;
  const initialDocumentIds = options.documentIds ?? [];

  const documents = initialDocumentIds
    .map((id) => getDocumentShape(editor, id))
    .filter((shape): shape is DocumentShape => Boolean(shape));

  const bounds = calculateCollectionBounds(documents, padding, editor);
  const center = getViewportCenter(editor);

  const x = documents.length ? bounds.x : center.x - bounds.w / 2;
  const y = documents.length ? bounds.y : center.y - bounds.h / 2;

  const collectionId = createShapeId();
  editor.createShape({
    id: collectionId,
    type: "collection",
    x,
    y,
    props: {
      w: bounds.w,
      h: bounds.h,
      label,
      documentIds: documents.map((doc) => doc.id),
    },
  });

  const labelId = createShapeId();
  editor.createShape({
    id: labelId,
    type: "text",
    parentId: collectionId,
    x: 16,
    y: -32,
    props: {
      color: "black",
      size: "m",
      font: "draw",
      textAlign: "start",
      w: 240,
      richText: toRichText(label),
      scale: 1,
      autoSize: true,
    },
  });

  documents.forEach((doc) => {
    if (typeof editor.reparentShapes === "function") {
      editor.reparentShapes([doc.id], collectionId);
      return;
    }

    editor.updateShapes([{ id: doc.id, type: "document", parentId: collectionId }]);
  });

  if (typeof editor.sendToBack === "function") {
    editor.sendToBack([collectionId]);
  }

  return { collectionId, labelId };
}

export function addDocumentToCollection(
  editor: Editor,
  collectionId: string,
  documentId: string
) {
  const collection = getCollectionShape(editor, collectionId);
  if (!collection) return;

  const document = getDocumentShape(editor, documentId);
  if (!document) return;

  if (!collection.props.documentIds.includes(documentId)) {
    const nextDocumentIds = [...collection.props.documentIds, documentId];
    editor.updateShapes([
      {
        id: collectionId,
        type: "collection",
        props: { ...collection.props, documentIds: nextDocumentIds },
      },
    ]);
  }

  if (typeof editor.reparentShapes === "function") {
    editor.reparentShapes([documentId], collectionId);
    return;
  }

  editor.updateShapes([{ id: documentId, type: "document", parentId: collectionId }]);
}

export function removeDocumentFromCollection(
  editor: Editor,
  collectionId: string,
  documentId: string,
  pageId: string
) {
  const collection = getCollectionShape(editor, collectionId);
  if (!collection) return;

  const document = getDocumentShape(editor, documentId);
  if (!document) return;

  const nextDocumentIds = collection.props.documentIds.filter((id) => id !== documentId);
  editor.updateShapes([
    {
      id: collectionId,
      type: "collection",
      props: { ...collection.props, documentIds: nextDocumentIds },
    },
  ]);

  if (typeof editor.reparentShapes === "function") {
    editor.reparentShapes([documentId], pageId);
    return;
  }

  editor.updateShapes([{ id: documentId, type: "document", parentId: pageId }]);
}

export function updateCollectionSize(
  editor: Editor,
  collectionId: string,
  padding = 40
) {
  const collection = getCollectionShape(editor, collectionId);
  if (!collection) return;

  const documents = collection.props.documentIds
    .map((id) => getDocumentShape(editor, id))
    .filter((shape): shape is DocumentShape => Boolean(shape));

  if (documents.length === 0) return;

  const bounds = calculateCollectionBounds(documents, padding, editor);
  const deltaX = bounds.x - collection.x;
  const deltaY = bounds.y - collection.y;

  const documentUpdates = documents.map((doc) => ({
    id: doc.id,
    type: "document" as const,
    x: doc.x - deltaX,
    y: doc.y - deltaY,
  }));

  editor.updateShapes([
    {
      id: collectionId,
      type: "collection",
      x: bounds.x,
      y: bounds.y,
      props: { ...collection.props, w: bounds.w, h: bounds.h },
    },
    ...documentUpdates,
  ]);
}
