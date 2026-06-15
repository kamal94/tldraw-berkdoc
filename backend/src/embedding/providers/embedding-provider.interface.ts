/**
 * Contract for an embedding backend. Implementations are selected by environment
 * so the same code runs MiniLM locally/offline and Workers AI in the cloud.
 */
export interface EmbeddingProvider {
  /** Optional warm-up (e.g. background model load). */
  init?(): Promise<void>;
  /** Embed a single text into a vector. */
  embed(text: string): Promise<number[]>;
  /** Embed multiple texts into vectors. */
  embedBatch(texts: string[]): Promise<number[][]>;
  /** Dimension of the produced vectors. */
  getEmbeddingDimension(): number;
}
