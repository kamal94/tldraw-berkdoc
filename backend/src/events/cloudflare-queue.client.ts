export interface CloudflareQueueClientOptions {
  accountId: string;
  queueId: string;
  apiToken: string;
  // Override for testing; defaults to the Cloudflare API.
  baseUrl?: string;
}

export interface PulledMessage {
  leaseId: string;
  body: unknown;
}

interface CloudflareApiResponse<T> {
  result: T;
  success: boolean;
  errors: { code?: number; message: string }[] | null;
}

interface PullResult {
  messages: {
    id: string;
    timestamp_ms: number;
    body: string;
    attempts: number;
    lease_id: string;
  }[];
}

/**
 * Talks to a Cloudflare Queue over the HTTP REST API. Used as the producer
 * (send) and HTTP-pull consumer (pull/ack) for the EventBus when the NestJS API
 * runs in Cloudflare Containers (which cannot bind Queues natively).
 */
export class CloudflareQueueClient {
  private readonly base: string;

  constructor(private readonly options: CloudflareQueueClientOptions) {
    const root = options.baseUrl ?? 'https://api.cloudflare.com/client/v4';
    this.base = `${root}/accounts/${options.accountId}/queues/${options.queueId}`;
  }

  private async request<T>(
    path: string,
    body: unknown,
  ): Promise<CloudflareApiResponse<T>> {
    const response = await fetch(`${this.base}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.options.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const parsed = (await response.json()) as CloudflareApiResponse<T>;
    if (!response.ok || !parsed.success) {
      const message =
        parsed.errors?.map((e) => e.message).join('; ') ||
        `HTTP ${response.status}`;
      throw new Error(`Cloudflare Queue request failed: ${message}`);
    }
    return parsed;
  }

  /** Publish a single JSON message onto the queue. */
  async send(message: unknown): Promise<void> {
    await this.request('/messages', { body: message, content_type: 'json' });
  }

  /** Pull a batch of messages via the HTTP-pull consumer. */
  async pull(
    batchSize: number,
    visibilityTimeoutMs: number,
  ): Promise<PulledMessage[]> {
    const parsed = await this.request<PullResult>('/messages/pull', {
      batch_size: batchSize,
      visibility_timeout_ms: visibilityTimeoutMs,
    });
    return parsed.result.messages.map((m) => ({
      leaseId: m.lease_id,
      body: JSON.parse(m.body) as unknown,
    }));
  }

  /** Acknowledge (delete) successfully processed messages by lease id. */
  async ack(leaseIds: string[]): Promise<void> {
    if (leaseIds.length === 0) return;
    await this.request('/messages/ack', {
      acks: leaseIds.map((leaseId) => ({ lease_id: leaseId })),
    });
  }
}
