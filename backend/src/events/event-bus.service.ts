import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CloudflareQueueClient } from './cloudflare-queue.client';

export type EventBusMode = 'in-process' | 'cloudflare-queue';

/** Envelope persisted on the queue so the consumer can re-dispatch the event. */
export interface EventEnvelope {
  event: string;
  payload: unknown;
}

/**
 * Publishes domain events behind an environment-selected backend:
 *   - EVENT_BUS=cloudflare-queue -> durable Cloudflare Queue (consumed by
 *     QueueConsumerService, or a consumer Worker in the cloud topology)
 *   - unset / "in-process"       -> the existing in-process EventEmitter2
 *     (zero-config local default; @OnEvent listeners are unchanged)
 *
 * Listeners keep using @OnEvent — only the publish side is abstracted, so the
 * rest of the app is agnostic to which backend is active.
 */
@Injectable()
export class EventBusService {
  private readonly logger = new Logger(EventBusService.name);
  private readonly mode: EventBusMode;
  private readonly queueClient: CloudflareQueueClient | null;

  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly configService: ConfigService,
  ) {
    this.mode = resolveEventBusMode(this.configService);
    this.queueClient =
      this.mode === 'cloudflare-queue'
        ? createQueueClient(this.configService)
        : null;
    this.logger.log(`EventBus mode: ${this.mode}`);
  }

  getMode(): EventBusMode {
    return this.mode;
  }

  /**
   * Publish a domain event. In-process this awaits the listeners (matching the
   * previous emitAsync behavior); on the queue it durably enqueues the event.
   */
  async publish(event: string, payload: unknown): Promise<void> {
    if (this.queueClient) {
      await this.queueClient.send({ event, payload } satisfies EventEnvelope);
      return;
    }
    await this.eventEmitter.emitAsync(event, payload);
  }
}

export function resolveEventBusMode(config: ConfigService): EventBusMode {
  const explicit = (config.get<string>('EVENT_BUS') ?? '').toLowerCase();
  if (explicit === 'cloudflare-queue' || explicit === 'queue') {
    return 'cloudflare-queue';
  }
  return 'in-process';
}

export function createQueueClient(config: ConfigService): CloudflareQueueClient {
  const accountId = config.get<string>('CLOUDFLARE_ACCOUNT_ID');
  const queueId = config.get<string>('CLOUDFLARE_QUEUE_ID');
  const apiToken = config.get<string>('CLOUDFLARE_API_TOKEN');
  if (!accountId || !queueId || !apiToken) {
    throw new Error(
      'EVENT_BUS=cloudflare-queue requires CLOUDFLARE_ACCOUNT_ID, ' +
        'CLOUDFLARE_QUEUE_ID, and CLOUDFLARE_API_TOKEN to be set',
    );
  }
  return new CloudflareQueueClient({ accountId, queueId, apiToken });
}
