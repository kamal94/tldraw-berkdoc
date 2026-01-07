export interface Document {
  id: string;
  title: string;
  content: string;
  url?: string;
  source: string;
  userId: string;
  dimensions: string[];
  createdAt: Date;
  updatedAt: Date;
}

