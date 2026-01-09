import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import pLimit from 'p-limit';

export type JobFunction<T = void> = () => Promise<T>;

@Injectable()
export class QueueService implements OnModuleInit {
  private readonly logger = new Logger(QueueService.name);

  // Different queues for different operation types
  // Initialized in onModuleInit, using definite assignment assertion
  private fileProcessingQueue!: ReturnType<typeof pLimit>;
  private llmQueue!: ReturnType<typeof pLimit>;
  private embeddingQueue!: ReturnType<typeof pLimit>;
  private weaviateQueue!: ReturnType<typeof pLimit>;

  // Queue statistics
  private stats = {
    fileProcessing: { pending: 0, active: 0, completed: 0, failed: 0 },
    llm: { pending: 0, active: 0, completed: 0, failed: 0 },
    embedding: { pending: 0, active: 0, completed: 0, failed: 0 },
    weaviate: { pending: 0, active: 0, completed: 0, failed: 0 },
  };

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    // Initialize queues with configurable concurrency limits
    const maxFileProcessing = this.configService.get<number>(
      'MAX_CONCURRENT_FILE_PROCESSING',
      3,
    );
    const maxLlmRequests = this.configService.get<number>(
      'MAX_CONCURRENT_LLM_REQUESTS',
      1,
    );
    const maxEmbeddings = this.configService.get<number>(
      'MAX_CONCURRENT_EMBEDDINGS',
      5,
    );
    const maxWeaviate = this.configService.get<number>(
      'MAX_CONCURRENT_WEAVIATE',
      10,
    );

    this.fileProcessingQueue = pLimit(maxFileProcessing);
    this.llmQueue = pLimit(maxLlmRequests);
    this.embeddingQueue = pLimit(maxEmbeddings);
    this.weaviateQueue = pLimit(maxWeaviate);

    this.logger.log(
      `Queue service initialized with limits: files=${maxFileProcessing}, llm=${maxLlmRequests}, embeddings=${maxEmbeddings}, weaviate=${maxWeaviate}`,
    );
  }

  /**
   * Queue a file processing job
   * Uses setImmediate to defer execution and avoid blocking the event loop
   */
  async queueFileProcessing<T>(job: JobFunction<T>, jobName?: string): Promise<T> {
    return new Promise((resolve, reject) => {
      setImmediate(() => {
        this.stats.fileProcessing.pending++;
        const startTime = Date.now();

        this.fileProcessingQueue(async () => {
          this.stats.fileProcessing.pending--;
          this.stats.fileProcessing.active++;
          try {
            const result = await job();
            this.stats.fileProcessing.active--;
            this.stats.fileProcessing.completed++;
            const duration = Date.now() - startTime;
            if (jobName) {
              this.logger.debug(
                `File processing job "${jobName}" completed in ${duration}ms`,
              );
            }
            resolve(result);
          } catch (error) {
            this.stats.fileProcessing.active--;
            this.stats.fileProcessing.failed++;
            const duration = Date.now() - startTime;
            if (jobName) {
              this.logger.error(
                `File processing job "${jobName}" failed after ${duration}ms`,
                error,
              );
            }
            reject(error);
          }
        });
      });
    });
  }

  /**
   * Queue an LLM operation (tags, summaries)
   */
  async queueLlmOperation<T>(job: JobFunction<T>, jobName?: string): Promise<T> {
    return new Promise((resolve, reject) => {
      setImmediate(() => {
        this.stats.llm.pending++;
        const startTime = Date.now();

        this.llmQueue(async () => {
          this.stats.llm.pending--;
          this.stats.llm.active++;
          try {
            const result = await job();
            this.stats.llm.active--;
            this.stats.llm.completed++;
            const duration = Date.now() - startTime;
            if (jobName) {
              this.logger.debug(`LLM job "${jobName}" completed in ${duration}ms`);
            }
            resolve(result);
          } catch (error) {
            this.stats.llm.active--;
            this.stats.llm.failed++;
            const duration = Date.now() - startTime;
            if (jobName) {
              this.logger.error(
                `LLM job "${jobName}" failed after ${duration}ms`,
                error,
              );
            }
            reject(error);
          }
        });
      });
    });
  }

  /**
   * Queue an embedding generation operation
   */
  async queueEmbedding<T>(job: JobFunction<T>, jobName?: string): Promise<T> {
    return new Promise((resolve, reject) => {
      setImmediate(() => {
        this.stats.embedding.pending++;
        const startTime = Date.now();

        this.embeddingQueue(async () => {
          this.stats.embedding.pending--;
          this.stats.embedding.active++;
          try {
            const result = await job();
            this.stats.embedding.active--;
            this.stats.embedding.completed++;
            const duration = Date.now() - startTime;
            if (jobName) {
              this.logger.debug(
                `Embedding job "${jobName}" completed in ${duration}ms`,
              );
            }
            resolve(result);
          } catch (error) {
            this.stats.embedding.active--;
            this.stats.embedding.failed++;
            const duration = Date.now() - startTime;
            if (jobName) {
              this.logger.error(
                `Embedding job "${jobName}" failed after ${duration}ms`,
                error,
              );
            }
            reject(error);
          }
        });
      });
    });
  }

  /**
   * Queue a Weaviate operation
   */
  async queueWeaviate<T>(job: JobFunction<T>, jobName?: string): Promise<T> {
    return new Promise((resolve, reject) => {
      setImmediate(() => {
        this.stats.weaviate.pending++;
        const startTime = Date.now();

        this.weaviateQueue(async () => {
          this.stats.weaviate.pending--;
          this.stats.weaviate.active++;
          try {
            const result = await job();
            this.stats.weaviate.active--;
            this.stats.weaviate.completed++;
            const duration = Date.now() - startTime;
            if (jobName) {
              this.logger.debug(
                `Weaviate job "${jobName}" completed in ${duration}ms`,
              );
            }
            resolve(result);
          } catch (error) {
            this.stats.weaviate.active--;
            this.stats.weaviate.failed++;
            const duration = Date.now() - startTime;
            if (jobName) {
              this.logger.error(
                `Weaviate job "${jobName}" failed after ${duration}ms`,
                error,
              );
            }
            reject(error);
          }
        });
      });
    });
  }

  /**
   * Get current queue statistics
   */
  getStats() {
    return {
      fileProcessing: { ...this.stats.fileProcessing },
      llm: { ...this.stats.llm },
      embedding: { ...this.stats.embedding },
      weaviate: { ...this.stats.weaviate },
    };
  }

  /**
   * Log current queue status
   */
  logQueueStatus() {
    const stats = this.getStats();
    this.logger.log('Queue status:', {
      fileProcessing: `${stats.fileProcessing.active} active, ${stats.fileProcessing.pending} pending`,
      llm: `${stats.llm.active} active, ${stats.llm.pending} pending`,
      embedding: `${stats.embedding.active} active, ${stats.embedding.pending} pending`,
      weaviate: `${stats.weaviate.active} active, ${stats.weaviate.pending} pending`,
    });
  }
}
