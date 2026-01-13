export interface CollaboratorData {
  email?: string;
  name: string;
  avatarUrl?: string;
  source: 'permissions' | 'revisions' | 'both';
  role?: string;
}

export interface CollaboratorRow {
  id: string;
  document_id: string;
  email: string | null;
  name: string;
  avatar_url: string | null;
  source: string;
  role: string | null;
  created_at: string;
  updated_at: string;
}
