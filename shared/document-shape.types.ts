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
