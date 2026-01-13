export interface Document {
  id: string;
  title: string;
  content: string;
  url?: string;
  source: string;
  userId: string;
  tags: string[];
  summary?: string;
  collaborators?: Array<{
    id: string;
    email?: string;
    name: string;
    avatarUrl?: string;
    source: string;
    role?: string;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

