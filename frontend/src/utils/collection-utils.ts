import type { Editor } from "tldraw";
import { createShapeId } from "tldraw";
import { toRichText, type TLParentId, type TLShapeId } from "@tldraw/tlschema";
import type { DocumentShape } from "../shapes/DocumentShape";
import type { CollectionShape } from "../shapes/CollectionShape";
import { COLLECTION_SHAPE_DEFAULTS } from "@shared/shape-schemas";

type CollectionBounds = { x: number; y: number; w: number; h: number };

export type CreateCollectionOptions = {
  label?: string;
  documentIds?: TLShapeId[];
  padding?: number;
};

const DEFAULT_COLLECTION_SIZE = { 
  w: COLLECTION_SHAPE_DEFAULTS.w, 
  h: COLLECTION_SHAPE_DEFAULTS.h 
};
export const GRID_COLUMNS = 3;
export const GRID_GAP = 16;
export const COLLECTION_PADDING = 40;

function getEffectiveColumns(documentCount: number, columns = GRID_COLUMNS) {
  return Math.min(columns, Math.max(1, documentCount));
}

function isDocumentShape(shape: unknown): shape is DocumentShape {
  return Boolean(shape && (shape as { type?: string }).type === "document");
}

function isCollectionShape(shape: unknown): shape is CollectionShape {
  return Boolean(shape && (shape as { type?: string }).type === "collection");
}

function getCollectionShape(editor: Editor, collectionId: TLShapeId) {
  const shape = editor.getShape(collectionId);
  if (!isCollectionShape(shape)) return null;
  return shape;
}

function getDocumentShape(editor: Editor, documentId: TLShapeId) {
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

export function calculateGridPosition(
  index: number,
  docWidth: number,
  docHeight: number,
  columns = GRID_COLUMNS,
  gap = GRID_GAP,
  padding = COLLECTION_PADDING
) {
  const column = index % columns;
  const row = Math.floor(index / columns);

  return {
    x: padding + column * (docWidth + gap),
    y: padding + row * (docHeight + gap),
  };
}

export function calculateGridCollectionSize(
  documentCount: number,
  docWidth: number,
  docHeight: number,
  columns = GRID_COLUMNS,
  gap = GRID_GAP,
  padding = COLLECTION_PADDING
) {
  if (documentCount === 0) {
    return { w: DEFAULT_COLLECTION_SIZE.w, h: DEFAULT_COLLECTION_SIZE.h };
  }

  const effectiveColumns = getEffectiveColumns(documentCount, columns);
  const rows = Math.max(1, Math.ceil(documentCount / effectiveColumns));
  const w = padding * 2 + effectiveColumns * docWidth + (effectiveColumns - 1) * gap;
  const h = padding * 2 + rows * docHeight + (rows - 1) * gap;

  return { w, h };
}

export function getDropIndexFromPosition(
  x: number,
  y: number,
  totalDocs: number,
  docWidth: number,
  docHeight: number,
  columns = GRID_COLUMNS,
  gap = GRID_GAP,
  padding = COLLECTION_PADDING
) {
  const effectiveColumns = getEffectiveColumns(Math.max(1, totalDocs + 1), columns);
  const cellWidth = docWidth + gap;
  const cellHeight = docHeight + gap;
  const localX = Math.max(0, x - padding);
  const localY = Math.max(0, y - padding);

  const column = Math.min(effectiveColumns - 1, Math.floor(localX / cellWidth));
  const row = Math.max(0, Math.floor(localY / cellHeight));
  const index = row * effectiveColumns + column;

  return Math.min(Math.max(index, 0), totalDocs);
}

export function repositionDocumentsInGrid(
  editor: Editor,
  collectionId: TLShapeId,
  columns = GRID_COLUMNS,
  gap = GRID_GAP,
  padding = COLLECTION_PADDING
) {
  const collection = getCollectionShape(editor, collectionId);
  if (!collection) return;

  // Only include documents that are actually children of this collection
  const documents = collection.props.documentIds
    .map((id) => getDocumentShape(editor, id as TLShapeId))
    .filter((shape): shape is DocumentShape => Boolean(shape))
    .filter((shape) => shape.parentId === collectionId);

  if (documents.length === 0) return;

  const { w: docWidth, h: docHeight } = documents[0].props;
  const effectiveColumns = getEffectiveColumns(documents.length, columns);

  const updates = documents
    .map((doc, index) => {
      const position = calculateGridPosition(
        index,
        docWidth,
        docHeight,
        effectiveColumns,
        gap,
        padding
      );
      if (doc.x === position.x && doc.y === position.y) return null;
      return {
        id: doc.id,
        type: "document" as const,
        x: position.x,
        y: position.y,
      };
    })
    .filter(
      (update): update is { id: TLShapeId; type: "document"; x: number; y: number } =>
        Boolean(update)
    );

  if (updates.length > 0) {
    editor.updateShapes(updates);
  }
}

export function createCollection(editor: Editor, options: CreateCollectionOptions = {}) {
  const label = options.label ?? "New Collection";
  const initialDocumentIds = options.documentIds ?? [];

  const documents = initialDocumentIds
    .map((id) => getDocumentShape(editor, id))
    .filter((shape): shape is DocumentShape => Boolean(shape));

  const docSize = documents[0]?.props ?? { w: 300, h: 180 };
  const gridSize = calculateGridCollectionSize(
    documents.length,
    docSize.w,
    docSize.h
  );

  const bounds = calculateCollectionBounds(documents, COLLECTION_PADDING, editor);
  const center = getViewportCenter(editor);

  const x = documents.length ? bounds.x : center.x - gridSize.w / 2;
  const y = documents.length ? bounds.y : center.y - gridSize.h / 2;

  const collectionId = createShapeId();
  editor.createShape({
    id: collectionId,
    type: "collection",
    x,
    y,
    props: {
      w: gridSize.w,
      h: gridSize.h,
      label,
      documentIds: documents.map((doc) => doc.id) as unknown as string[],
      color: COLLECTION_SHAPE_DEFAULTS.color,
      dash: COLLECTION_SHAPE_DEFAULTS.dash,
    },
  });

  const labelId = createShapeId();
  editor.createShape({
    id: labelId,
    type: "text",
    parentId: collectionId as TLParentId,
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

  const effectiveColumns = getEffectiveColumns(documents.length, GRID_COLUMNS);
  documents.forEach((doc, index) => {
    if (typeof editor.reparentShapes === "function") {
      editor.reparentShapes([doc.id], collectionId as TLParentId);
    } else {
      editor.updateShapes([
        { id: doc.id, type: "document", parentId: collectionId as TLParentId },
      ]);
    }

    const position = calculateGridPosition(
      index,
      docSize.w,
      docSize.h,
      effectiveColumns
    );
    editor.updateShapes([
      {
        id: doc.id,
        type: "document",
        x: position.x,
        y: position.y,
      },
    ]);
  });

  if (typeof editor.sendToBack === "function") {
    editor.sendToBack([collectionId]);
  }

  return { collectionId, labelId };
}

export function addDocumentToCollection(
  editor: Editor,
  collectionId: TLShapeId,
  documentId: TLShapeId
) {
  const collection = getCollectionShape(editor, collectionId);
  if (!collection) return;

  const document = getDocumentShape(editor, documentId);
  if (!document) return;

  const documentIdValue = documentId as unknown as string;
  const nextDocumentIds = collection.props.documentIds.includes(documentIdValue)
    ? collection.props.documentIds
    : [...collection.props.documentIds, documentIdValue];

  if (!collection.props.documentIds.includes(documentIdValue)) {
    editor.updateShapes([
      {
        id: collectionId,
        type: "collection",
        props: { ...collection.props, documentIds: nextDocumentIds },
      },
    ]);
  }

  if (typeof editor.reparentShapes === "function") {
    editor.reparentShapes([documentId], collectionId as TLParentId);
  } else {
    editor.updateShapes([
      { id: documentId, type: "document", parentId: collectionId as TLParentId },
    ]);
  }

  const docSize = document.props;
  const effectiveColumns = getEffectiveColumns(nextDocumentIds.length, GRID_COLUMNS);
  const position = calculateGridPosition(
    nextDocumentIds.indexOf(documentIdValue),
    docSize.w,
    docSize.h,
    effectiveColumns
  );

  editor.updateShapes([
    {
      id: documentId,
      type: "document",
      x: position.x,
      y: position.y,
    },
  ]);
}

export function removeDocumentFromCollection(
  editor: Editor,
  collectionId: TLShapeId,
  documentId: TLShapeId,
  pageId: TLParentId
) {
  const collection = getCollectionShape(editor, collectionId);
  if (!collection) return;

  const document = getDocumentShape(editor, documentId);
  if (!document) return;

  const documentIdValue = documentId as unknown as string;
  const nextDocumentIds = collection.props.documentIds.filter((id) => id !== documentIdValue);
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
  collectionId: TLShapeId,
  padding = COLLECTION_PADDING
) {
  const collection = getCollectionShape(editor, collectionId);
  if (!collection) return;

  const documents = collection.props.documentIds
    .map((id) => getDocumentShape(editor, id as TLShapeId))
    .filter((shape): shape is DocumentShape => Boolean(shape));

  const docSize = documents[0]?.props ?? { w: 300, h: 180 };
  const gridSize = calculateGridCollectionSize(
    documents.length,
    docSize.w,
    docSize.h,
    GRID_COLUMNS,
    GRID_GAP,
    padding
  );

  editor.updateShapes([
    {
      id: collectionId,
      type: "collection",
      props: { ...collection.props, w: gridSize.w, h: gridSize.h },
    },
  ]);

  repositionDocumentsInGrid(editor, collectionId);
}
