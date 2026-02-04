/**
 * Unified shape schemas for frontend and backend
 * 
 * This file provides default values that are shared between the frontend 
 * and backend to ensure consistency.
 * 
 * Types are defined in document-shape.types.ts
 */

import type { 
  DocumentShapeProps, 
  CollectionShapeProps,
  TLDefaultColorStyle,
  TLDefaultDashStyle,
} from './document-shape.types';

// ============================================================================
// Document Shape Defaults
// ============================================================================

export const DOCUMENT_SHAPE_DEFAULTS: DocumentShapeProps = {
  w: 300,
  h: 180,
  title: "Untitled",
  url: "",
  source: undefined,
  contributors: [],
  tags: [],
  summary: undefined,
};

// ============================================================================
// Collection Shape Defaults
// ============================================================================

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
