export interface DuplicateResponseDto {
  id: string;
  userId: string;
  sourceDocumentId: string;
  targetDocumentId: string;
  sourceChunkIndex?: number;
  targetChunkIndex?: number;
  similarityScore: number;
  duplicateType: 'chunk' | 'document';
  createdAt: string;
  updatedAt: string;
}

export interface DetectDuplicatesResponseDto {
  message: string;
}
