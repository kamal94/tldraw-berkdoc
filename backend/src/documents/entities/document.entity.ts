export interface Document {
  id: string;
  title: string;
  content: string;
  url?: string;
  source: string;
  userId: string;
  tags: string[];
  summary?: string;
  createdAt: Date;
  updatedAt: Date;
}

