// Shared types for document shapes between frontend and backend

export type DocumentSource = 
  | "google-docs" 
  | "google-sheets" 
  | "google-drive"
  | "notion" 
  | "word" 
  | "excel" 
  | "box" 
  | "github" 
  | "figma" 
  | "generic";

// Contributor type for the shape
export interface Contributor {
  email: string;
  name: string;
  avatarUrl?: string;
  color: string;
}

// Document shape properties
export interface DocumentShapeProps {
  w: number;
  h: number;
  title: string;
  url: string;
  source?: DocumentSource;
  contributors: Contributor[];
  tags: string[];
  summary?: string;
}

// tldraw default color style values
export type TLDefaultColorStyle = 
  | "black" 
  | "blue" 
  | "green" 
  | "grey" 
  | "light-blue" 
  | "light-green" 
  | "light-red" 
  | "light-violet" 
  | "orange" 
  | "red" 
  | "violet" 
  | "white" 
  | "yellow";

// tldraw default dash style values
export type TLDefaultDashStyle = "solid" | "dashed" | "dotted" | "draw";

// Collection shape properties
// Note: color and dash are optional at runtime for backward compatibility
// with existing shapes, but the StylePanel requires them to be defined
// in the ShapeUtil's static props using DefaultColorStyle/DefaultDashStyle
export interface CollectionShapeProps {
  w: number;
  h: number;
  label: string;
  documentIds: string[];
  color: TLDefaultColorStyle;
  dash: TLDefaultDashStyle;
}
