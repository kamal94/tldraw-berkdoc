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

@Injectable()
export class WeaviateService implements OnModuleInit {
  private client!: WeaviateClient;
  private readonly logger = new Logger(WeaviateService.name);
  private readonly collectionName = 'DocumentChunk';

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
      const exists = await this.client.collections.exists(this.collectionName);
      if (!exists) {
        const collectionConfig: CollectionConfigCreate = {
          name: this.collectionName,
          properties: [
            { name: 'documentId', dataType: 'text' },
            { name: 'chunkIndex', dataType: 'int' },
            { name: 'content', dataType: 'text' },
            { name: 'title', dataType: 'text' },
            { name: 'source', dataType: 'text' },
            { name: 'userId', dataType: 'text' },
          ],
        };
        await this.client.collections.create(collectionConfig);
        this.logger.log(`Created collection: ${this.collectionName}`);
      } else {
        this.logger.log(`Collection ${this.collectionName} already exists`);
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
      vectors: vector,
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
}

