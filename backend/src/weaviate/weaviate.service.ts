import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import weaviate, { WeaviateClient, type CollectionConfigCreate, Filters } from 'weaviate-client';

export interface DocumentChunkData {
  documentId: string;
  chunkIndex: number;
  content: string;
  title: string;
  source: string;
  userId: string;
}

export interface DocumentData {
  documentId: string;
  title: string;
  source: string;
  userId: string;
}

@Injectable()
export class WeaviateService implements OnModuleInit {
  private client!: WeaviateClient;
  private readonly logger = new Logger(WeaviateService.name);
  private readonly collectionName = 'DocumentChunk';
  private readonly documentCollectionName = 'Document';

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    await this.connect();
    await this.ensureSchema();
  }

  private async connect() {
    const host = this.configService.get<string>('WEAVIATE_HOST', 'localhost');
    const port = this.configService.get<number>('WEAVIATE_PORT', 8080);
    const scheme = this.configService.get<string>('WEAVIATE_SCHEME', 'http');

    try {
      this.client = await weaviate.connectToLocal({
        host,
        port,
        grpcPort: 50051,
      });
      this.logger.log(`Connected to Weaviate at ${scheme}://${host}:${port}`);
    } catch (error) {
      this.logger.error('Failed to connect to Weaviate', error);
      this.logger.warn(
        `Could not connect to Weaviate at ${scheme}://${host}:${port}. Service will retry on first use.`,
      );
    }
  }

  private async ensureSchema() {
    if (!this.client) {
      this.logger.warn('Weaviate client not connected, skipping schema creation');
      return;
    }

    try {
      // Ensure DocumentChunk collection exists
      const chunkExists = await this.client.collections.exists(this.collectionName);
      if (!chunkExists) {
        const chunkCollectionConfig = {
          name: this.collectionName,
          properties: [
            { name: 'documentId', dataType: 'text' },
            { name: 'chunkIndex', dataType: 'int' },
            { name: 'content', dataType: 'text' },
            { name: 'title', dataType: 'text' },
            { name: 'source', dataType: 'text' },
            { name: 'userId', dataType: 'text' },
          ],
          vectorizers: [], // No vectorizer - we provide our own vectors
          vectorIndexConfig: {
            distance: 'cosine',
          },
        } as CollectionConfigCreate;
        await this.client.collections.create(chunkCollectionConfig);
        this.logger.log(`Created collection: ${this.collectionName}`);
      } else {
        this.logger.log(`Collection ${this.collectionName} already exists`);
      }

      // Ensure Document collection exists
      const documentExists = await this.client.collections.exists(this.documentCollectionName);
      if (!documentExists) {
        const documentCollectionConfig = {
          name: this.documentCollectionName,
          properties: [
            { name: 'documentId', dataType: 'text' },
            { name: 'title', dataType: 'text' },
            { name: 'source', dataType: 'text' },
            { name: 'userId', dataType: 'text' },
          ],
          vectorizers: [], // No vectorizer - we provide our own vectors
          vectorIndexConfig: {
            distance: 'cosine',
          },
        } as CollectionConfigCreate;
        await this.client.collections.create(documentCollectionConfig);
        this.logger.log(`Created collection: ${this.documentCollectionName}`);
      } else {
        this.logger.log(`Collection ${this.documentCollectionName} already exists`);
      }
    } catch (error) {
      this.logger.error('Failed to ensure schema', error);
    }
  }

  async storeChunk(data: DocumentChunkData, vector: number[]): Promise<string> {
    if (!this.client) {
      throw new Error('Weaviate client not connected');
    }

    const collection = this.client.collections.get(this.collectionName);
    const result = await collection.data.insert({
      properties: {
        documentId: data.documentId,
        chunkIndex: data.chunkIndex,
        content: data.content,
        title: data.title,
        source: data.source,
        userId: data.userId,
      },
      vectors: vector, // Use 'vectors' (plural) for Weaviate v3 client
    });

    this.logger.debug(`Stored chunk ${data.chunkIndex} for document ${data.documentId}`);
    return result;
  }

  async searchSimilar(
    vector: number[],
    userId: string,
    limit: number = 10,
  ): Promise<Array<DocumentChunkData & { score: number }>> {
    if (!this.client) {
      throw new Error('Weaviate client not connected');
    }

    const collection = this.client.collections.get(this.collectionName);
    const result = await collection.query.nearVector(vector, {
      limit,
      returnMetadata: ['distance'],
      filters: collection.filter.byProperty('userId').equal(userId),
    });

    return result.objects.map((obj) => ({
      documentId: obj.properties.documentId as string,
      chunkIndex: obj.properties.chunkIndex as number,
      content: obj.properties.content as string,
      title: obj.properties.title as string,
      source: obj.properties.source as string,
      userId: obj.properties.userId as string,
      score: obj.metadata?.distance ? 1 - obj.metadata.distance : 0,
    }));
  }

  async deleteDocumentChunks(documentId: string, userId: string): Promise<void> {
    if (!this.client) {
      throw new Error('Weaviate client not connected');
    }

    const collection = this.client.collections.get(this.collectionName);
    await collection.data.deleteMany(
      Filters.and(
        collection.filter.byProperty('documentId').equal(documentId),
        collection.filter.byProperty('userId').equal(userId),
      ),
    );

    this.logger.debug(`Deleted chunks for document ${documentId}`);
  }

  async deleteUserChunks(userId: string): Promise<void> {
    if (!this.client) {
      throw new Error('Weaviate client not connected');
    }

    const collection = this.client.collections.get(this.collectionName);
    await collection.data.deleteMany(
      collection.filter.byProperty('userId').equal(userId),
    );

    this.logger.debug(`Deleted chunks for user ${userId}`);
  }

  async clearAllChunks(): Promise<void> {
    if (!this.client) {
      throw new Error('Weaviate client not connected');
    }

    const collection = this.client.collections.get(this.collectionName);
    await collection.data.deleteMany(
      collection.filter.byProperty('chunkIndex').greaterThan(-1), // This will match all
    );

    this.logger.debug('Cleared all chunks from Weaviate');
  }

  async getDocumentChunks(documentId: string, userId: string): Promise<DocumentChunkData[]> {
    if (!this.client) {
      throw new Error('Weaviate client not connected');
    }

    const collection = this.client.collections.get(this.collectionName);
    const result = await collection.query.fetchObjects({
      filters: Filters.and(
        collection.filter.byProperty('documentId').equal(documentId),
        collection.filter.byProperty('userId').equal(userId),
      ),
    });

    return result.objects.map((obj) => ({
      documentId: obj.properties.documentId as string,
      chunkIndex: obj.properties.chunkIndex as number,
      content: obj.properties.content as string,
      title: obj.properties.title as string,
      source: obj.properties.source as string,
      userId: obj.properties.userId as string,
    }));
  }

  async getUserChunksWithVectors(
    userId: string,
  ): Promise<Array<DocumentChunkData & { vector: number[] }>> {
    if (!this.client) {
      throw new Error('Weaviate client not connected');
    }

    const collection = this.client.collections.get(this.collectionName);
    const allChunks: Array<DocumentChunkData & { vector: number[] }> = [];
    let cursor: string | undefined;
    const batchSize = 10000; // Max limit per query

    // Fetch in batches to handle more than 10k chunks
    do {
      const result = await collection.query.fetchObjects({
        filters: collection.filter.byProperty('userId').equal(userId),
        limit: batchSize,
        includeVector: true, // Use boolean for includeVector
        after: cursor,
      });

      const batch = result.objects.map((obj) => {
        // Extract vector from the object
        // In Weaviate v4, vectors are accessed via obj.vectors (plural) or obj.vector
        let vector: number[] = [];
        
        // Try obj.vector first
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let vecData = (obj as any).vector;
        
        // If not found, try obj.vectors
        if (!vecData) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          vecData = (obj as any).vectors;
        }
        
        // If still not found, try vectors.default
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (!vecData && (obj as any).vectors) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          vecData = (obj as any).vectors.default;
        }
        
        if (vecData) {
          if (Array.isArray(vecData)) {
            vector = vecData;
          } else if (vecData instanceof Float32Array) {
            vector = Array.from(vecData);
          } else if (typeof vecData === 'object' && 'default' in vecData) {
            const def = vecData.default;
            if (Array.isArray(def)) {
              vector = def;
            } else if (def instanceof Float32Array) {
              vector = Array.from(def);
            }
          } else if (typeof vecData === 'object') {
            // Try to get first value
            const keys = Object.keys(vecData);
            if (keys.length > 0) {
              const firstKey = keys[0];
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const val = (vecData as any)[firstKey];
              if (Array.isArray(val)) {
                vector = val;
              } else if (val instanceof Float32Array) {
                vector = Array.from(val);
              }
            }
          }
        }

        return {
          documentId: obj.properties.documentId as string,
          chunkIndex: obj.properties.chunkIndex as number,
          content: obj.properties.content as string,
          title: obj.properties.title as string,
          source: obj.properties.source as string,
          userId: obj.properties.userId as string,
          vector,
        };
      });

      allChunks.push(...batch);
      cursor = result.objects.length === batchSize ? (result.objects[result.objects.length - 1] as { id?: string }).id : undefined;
    } while (cursor);

    return allChunks;
  }

  /**
   * Get document chunks with their vectors for computing document embeddings
   */
  async getDocumentChunksWithVectors(
    documentId: string,
    userId: string,
  ): Promise<Array<DocumentChunkData & { vector: number[] }>> {
    if (!this.client) {
      throw new Error('Weaviate client not connected');
    }

    const collection = this.client.collections.get(this.collectionName);
    const result = await collection.query.fetchObjects({
      filters: Filters.and(
        collection.filter.byProperty('documentId').equal(documentId),
        collection.filter.byProperty('userId').equal(userId),
      ),
      includeVector: true,
    });

    return result.objects.map((obj) => {
      // Extract vector from the object
      let vector: number[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let vecData = (obj as any).vector;

      if (!vecData) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        vecData = (obj as any).vectors;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (!vecData && (obj as any).vectors) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        vecData = (obj as any).vectors.default;
      }

      if (vecData) {
        if (Array.isArray(vecData)) {
          vector = vecData;
        } else if (vecData instanceof Float32Array) {
          vector = Array.from(vecData);
        } else if (typeof vecData === 'object' && 'default' in vecData) {
          const def = vecData.default;
          if (Array.isArray(def)) {
            vector = def;
          } else if (def instanceof Float32Array) {
            vector = Array.from(def);
          }
        } else if (typeof vecData === 'object') {
            const keys = Object.keys(vecData);
            if (keys.length > 0) {
              const firstKey = keys[0];
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const val = (vecData as any)[firstKey];
            if (Array.isArray(val)) {
              vector = val;
            } else if (val instanceof Float32Array) {
              vector = Array.from(val);
            }
          }
        }
      }

      return {
        documentId: obj.properties.documentId as string,
        chunkIndex: obj.properties.chunkIndex as number,
        content: obj.properties.content as string,
        title: obj.properties.title as string,
        source: obj.properties.source as string,
        userId: obj.properties.userId as string,
        vector,
      };
    });
  }

  /**
   * Store document embedding in Document collection
   */
  async storeDocument(data: DocumentData, vector: number[]): Promise<string> {
    if (!this.client) {
      throw new Error('Weaviate client not connected');
    }

    if (!vector || vector.length === 0) {
      throw new Error(`Cannot store empty vector for document ${data.documentId}`);
    }

    const collection = this.client.collections.get(this.documentCollectionName);
    
    // First, delete any existing document embedding to avoid duplicates
    try {
      await collection.data.deleteMany(
        Filters.and(
          collection.filter.byProperty('documentId').equal(data.documentId),
          collection.filter.byProperty('userId').equal(data.userId),
        ),
      );
    } catch {
      // Ignore errors if document doesn't exist
      this.logger.debug(`No existing document embedding to delete for ${data.documentId}`);
    }

    // Insert with vectors (plural) - Weaviate v3 client requires 'vectors' not 'vector'
    const result = await collection.data.insert({
      properties: {
        documentId: data.documentId,
        title: data.title,
        source: data.source,
        userId: data.userId,
      },
      vectors: vector, // Use 'vectors' (plural) for Weaviate v3 client
    });

    this.logger.debug(`Stored document embedding for ${data.documentId} (vector dim: ${vector.length})`);
    return result;
  }

  /**
   * Search for similar documents using document embeddings
   */
  async searchSimilarDocuments(
    vector: number[],
    userId: string,
    limit: number,
  ): Promise<Array<DocumentData & { score: number }>> {
    if (!this.client) {
      throw new Error('Weaviate client not connected');
    }
    this.logger.debug(`Searching for similar documents for user ${userId} with vector ${vector.length} and limit ${limit}`);
    const collection = this.client.collections.get(this.documentCollectionName);
    const result = await collection.query.nearVector(vector, {
      limit: 2000,
      returnMetadata: ['distance'],
      filters: collection.filter.byProperty('userId').equal(userId),
    });

    return result.objects.map((obj) => ({
      documentId: obj.properties.documentId as string,
      title: obj.properties.title as string,
      source: obj.properties.source as string,
      userId: obj.properties.userId as string,
      score: obj.metadata?.distance ? 1 - obj.metadata.distance : 0,
    }));
  }

  /**
   * Get document embedding for a specific document
   */
  async getDocumentEmbedding(
    documentId: string,
    userId: string,
  ): Promise<(DocumentData & { vector: number[] }) | null> {
    if (!this.client) {
      throw new Error('Weaviate client not connected');
    }

    const collection = this.client.collections.get(this.documentCollectionName);
    const result = await collection.query.fetchObjects({
      filters: Filters.and(
        collection.filter.byProperty('documentId').equal(documentId),
        collection.filter.byProperty('userId').equal(userId),
      ),
      includeVector: true,
      limit: 1,
    });

    if (result.objects.length === 0) {
      return null;
    }

    const obj = result.objects[0];
    let vector: number[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let vecData = (obj as any).vector;

    if (!vecData) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vecData = (obj as any).vectors;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!vecData && (obj as any).vectors) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vecData = (obj as any).vectors.default;
    }

    if (vecData) {
      if (Array.isArray(vecData)) {
        vector = vecData;
      } else if (vecData instanceof Float32Array) {
        vector = Array.from(vecData);
      } else if (typeof vecData === 'object' && 'default' in vecData) {
        const def = vecData.default;
        if (Array.isArray(def)) {
          vector = def;
        } else if (def instanceof Float32Array) {
          vector = Array.from(def);
        }
      } else if (typeof vecData === 'object') {
        const keys = Object.keys(vecData);
        if (keys.length > 0) {
          const firstKey = keys[0];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const val = (vecData as any)[firstKey];
          if (Array.isArray(val)) {
            vector = val;
          } else if (val instanceof Float32Array) {
            vector = Array.from(val);
          }
        }
      }
    }

    return {
      documentId: obj.properties.documentId as string,
      title: obj.properties.title as string,
      source: obj.properties.source as string,
      userId: obj.properties.userId as string,
      vector,
    };
  }

  /**
   * Delete document embedding
   */
  async deleteDocumentEmbedding(documentId: string, userId: string): Promise<void> {
    if (!this.client) {
      throw new Error('Weaviate client not connected');
    }

    const collection = this.client.collections.get(this.documentCollectionName);
    await collection.data.deleteMany(
      Filters.and(
        collection.filter.byProperty('documentId').equal(documentId),
        collection.filter.byProperty('userId').equal(userId),
      ),
    );

    this.logger.debug(`Deleted document embedding for ${documentId}`);
  }

  /**
   * Delete all document embeddings for a user
   */
  async deleteUserDocuments(userId: string): Promise<void> {
    if (!this.client) {
      throw new Error('Weaviate client not connected');
    }

    const collection = this.client.collections.get(this.documentCollectionName);
    await collection.data.deleteMany(
      collection.filter.byProperty('userId').equal(userId),
    );

    this.logger.debug(`Deleted all document embeddings for user ${userId}`);
  }

  /**
   * Get all document embeddings for a user (for duplicate detection)
   */
  async getUserDocumentsWithVectors(
    userId: string,
  ): Promise<Array<DocumentData & { vector: number[] }>> {
    if (!this.client) {
      throw new Error('Weaviate client not connected');
    }

    const collection = this.client.collections.get(this.documentCollectionName);
    const allDocuments: Array<DocumentData & { vector: number[] }> = [];
    let cursor: string | undefined;
    const batchSize = 10000;

    do {
      const result = await collection.query.fetchObjects({
        filters: collection.filter.byProperty('userId').equal(userId),
        limit: batchSize,
        includeVector: true,
        after: cursor,
      });

      const batch = result.objects.map((obj) => {
        let vector: number[] = [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let vecData = (obj as any).vector;

        if (!vecData) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          vecData = (obj as any).vectors;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (!vecData && (obj as any).vectors) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          vecData = (obj as any).vectors.default;
        }

        if (vecData) {
          if (Array.isArray(vecData)) {
            vector = vecData;
          } else if (vecData instanceof Float32Array) {
            vector = Array.from(vecData);
          } else if (typeof vecData === 'object' && 'default' in vecData) {
            const def = vecData.default;
            if (Array.isArray(def)) {
              vector = def;
            } else if (def instanceof Float32Array) {
              vector = Array.from(def);
            }
          } else if (typeof vecData === 'object') {
            const keys = Object.keys(vecData);
            if (keys.length > 0) {
              const firstKey = keys[0];
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const val = (vecData as any)[firstKey];
              if (Array.isArray(val)) {
                vector = val;
              } else if (val instanceof Float32Array) {
                vector = Array.from(val);
              }
            }
          }
        }

        return {
          documentId: obj.properties.documentId as string,
          title: obj.properties.title as string,
          source: obj.properties.source as string,
          userId: obj.properties.userId as string,
          vector,
        };
      });

      allDocuments.push(...batch);
      cursor = result.objects.length === batchSize ? (result.objects[result.objects.length - 1] as { id?: string }).id : undefined;
    } while (cursor);

    return allDocuments;
  }
}

