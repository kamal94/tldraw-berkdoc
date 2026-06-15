import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CloudflareQueueClient } from './cloudflare-queue.client';
import {
  EventEnvelope,
  createQueueClient,
  resolveEventBusMode,
} from './event-bus.service';

/**
 * Polls the Cloudflare Queue via the HTTP-pull consumer and re-dispatches each
 * message into the in-process EventEmitter2 so existing @OnEvent listeners run.
 * Only active when EVENT_BUS=cloudflare-queue and EVENT_BUS_CONSUMER is enabled
 * (default on). In the cloud topology a consumer Worker can play this role
 * instead by setting EVENT_BUS_CONSUMER=false here.
 */
@Injectable()
export class QueueConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueConsumerService.name);
  private client: CloudflareQueueClient | null = null;
  private running = false;
  private stopped = false;
  private readonly batchSize: number;
  private readonly visibilityTimeoutMs: number;
  private readonly pollIntervalMs: number;

  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly configService: ConfigService,
  ) {
    this.batchSize = this.configService.get<number>('EVENT_BUS_BATCH_SIZE', 10);
    this.visibilityTimeoutMs = this.configService.get<number>(
      'EVENT_BUS_VISIBILITY_TIMEOUT_MS',
      30000,
    );
    this.pollIntervalMs = this.configService.get<number>(
      'EVENT_BUS_POLL_INTERVAL_MS',
      1000,
    );
  }

  onModuleInit(): void {
    if (resolveEventBusMode(this.configService) !== 'cloudflare-queue') {
      return;
    }
    const consumerEnabled =
      (this.configService.get<string>('EVENT_BUS_CONSUMER') ?? 'true')
        .toLowerCase() !== 'false';
    if (!consumerEnabled) {
      this.logger.log('Queue consumer disabled (EVENT_BUS_CONSUMER=false)');
      return;
    }

    this.client = createQueueClient(this.configService);
    this.running = true;
    this.logger.log(
      `Queue consumer started (batch=${this.batchSize}, ` +
        `interval=${this.pollIntervalMs}ms)`,
    );
    void this.loop();
  }

  onModuleDestroy(): void {
    this.running = false;
  }

  private async loop(): Promise<void> {
    while (this.running) {
      try {
        await this.pollOnce();
      } catch (error) {
        this.logger.error('Queue poll failed', error);
      }
      if (this.running) {
        await this.sleep(this.pollIntervalMs);
      }
    }
    this.stopped = true;
  }

  /** Pull one batch and dispatch it. Returns the number of acked messages. */
  async pollOnce(): Promise<number> {
    if (!this.client) return 0;
    const messages = await this.client.pull(
      this.batchSize,
      this.visibilityTimeoutMs,
    );
    if (messages.length === 0) return 0;

    const acked: string[] = [];
    for (const message of messages) {
      const envelope = message.body as EventEnvelope;
      if (!envelope || typeof envelope.event !== 'string') {
        this.logger.warn('Skipping malformed queue message');
        acked.push(message.leaseId);
        continue;
      }
      try {
        await this.eventEmitter.emitAsync(envelope.event, envelope.payload);
        acked.push(message.leaseId);
      } catch (error) {
        // Leave unacked so Cloudflare redelivers after the visibility timeout.
        this.logger.error(
          `Handler failed for event ${envelope.event}; will retry`,
          error,
        );
      }
    }

    await this.client.ack(acked);
    return acked.length;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** Test/diagnostic helper. */
  isStopped(): boolean {
    return this.stopped;
  }
}
