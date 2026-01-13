export interface Board {
  id: string;
  userId: string;
  name: string;
  snapshot: string | null; // JSON string of TLStoreSnapshot
  createdAt: Date;
  updatedAt: Date;
}
