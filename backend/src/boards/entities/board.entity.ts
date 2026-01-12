export interface Board {
  id: string;
  userId: string;
  snapshot: string | null; // JSON string of TLStoreSnapshot
  createdAt: Date;
  updatedAt: Date;
}
