import { Container, getContainer } from '@cloudflare/containers';

export interface Env {
  API_CONTAINER: DurableObjectNamespace<BerkdocApiContainer>;

  // Non-secret config (from wrangler.toml [vars]).
  DB_DRIVER: string;
  BLOB_DRIVER: string;
  EVENT_BUS: string;
  EMBEDDING_PROVIDER: string;
  WEAVIATE_DRIVER: string;
  CLOUDFLARE_ACCOUNT_ID: string;
  CLOUDFLARE_D1_DATABASE_ID: string;
  CLOUDFLARE_QUEUE_ID: string;
  R2_BUCKET: string;
  APP_WS_PATH: string;

  // Secrets (from `wrangler secret put`).
  CLOUDFLARE_API_TOKEN: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  JWT_SECRET: string;
  WEAVIATE_CLOUD_URL: string;
  WEAVIATE_CLOUD_API_KEY: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_CALLBACK_URL: string;
  FRONTEND_URL: string;
}

/**
 * Durable Object that manages the NestJS API container instance. The backend
 * image reads all of its configuration from environment variables; here we
 * forward the Worker's vars + secrets into the container process so it boots in
 * cloud mode (D1 over HTTP, R2 blobs, Cloudflare Queues, Workers AI, Weaviate
 * Cloud).
 */
export class BerkdocApiContainer extends Container<Env> {
  defaultPort = 3000;
  sleepAfter = '15m';

  // Forwarded to the container process. Field initializers run after super(),
  // so this.env (set by the DurableObject base) is available here.
  envVars: Record<string, string> = {
    PORT: '3000',
    DB_DRIVER: this.env.DB_DRIVER,
    BLOB_DRIVER: this.env.BLOB_DRIVER,
    EVENT_BUS: this.env.EVENT_BUS,
    EMBEDDING_PROVIDER: this.env.EMBEDDING_PROVIDER,
    WEAVIATE_DRIVER: this.env.WEAVIATE_DRIVER,
    CLOUDFLARE_ACCOUNT_ID: this.env.CLOUDFLARE_ACCOUNT_ID,
    CLOUDFLARE_D1_DATABASE_ID: this.env.CLOUDFLARE_D1_DATABASE_ID,
    CLOUDFLARE_QUEUE_ID: this.env.CLOUDFLARE_QUEUE_ID,
    R2_BUCKET: this.env.R2_BUCKET,
    APP_WS_PATH: this.env.APP_WS_PATH,
    CLOUDFLARE_API_TOKEN: this.env.CLOUDFLARE_API_TOKEN,
    R2_ACCESS_KEY_ID: this.env.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: this.env.R2_SECRET_ACCESS_KEY,
    JWT_SECRET: this.env.JWT_SECRET,
    WEAVIATE_CLOUD_URL: this.env.WEAVIATE_CLOUD_URL,
    WEAVIATE_CLOUD_API_KEY: this.env.WEAVIATE_CLOUD_API_KEY,
    GOOGLE_CLIENT_ID: this.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: this.env.GOOGLE_CLIENT_SECRET,
    GOOGLE_CALLBACK_URL: this.env.GOOGLE_CALLBACK_URL,
    FRONTEND_URL: this.env.FRONTEND_URL,
  };
}

/**
 * Front-door Worker. Forwards every request to a single shared container
 * instance so the in-process event listeners and queue consumer stay coherent.
 * (Horizontal scaling would move the queue consumer to a dedicated Worker via
 * EVENT_BUS_CONSUMER=false; see ARCHITECTURE.md.)
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const container = getContainer(env.API_CONTAINER);
    return container.fetch(request);
  },
};
