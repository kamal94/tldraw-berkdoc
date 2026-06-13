import type {
  DocumentShapeProps,
  CollectionShapeProps,
  TLDefaultColorStyle,
  TLDefaultDashStyle,
} from './document-shape.types';

export const DOCUMENT_SHAPE_DEFAULTS: DocumentShapeProps = {
  w: 300,
  h: 180,
  title: "Untitled",
  url: "",
  contributors: [],
  tags: [],
};

export const COLLECTION_COLOR_DEFAULT: TLDefaultColorStyle = "light-blue";
export const COLLECTION_DASH_DEFAULT: TLDefaultDashStyle = "solid";

export const COLLECTION_SHAPE_DEFAULTS: CollectionShapeProps = {
  w: 600,
  h: 400,
  label: "New Collection",
  documentIds: [],
  color: COLLECTION_COLOR_DEFAULT,
  dash: COLLECTION_DASH_DEFAULT,
};
