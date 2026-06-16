# berkdoc-api-worker

Cloudflare Worker that fronts the NestJS API running inside a **Cloudflare
Container** (built from [`../backend/Dockerfile`](../backend/Dockerfile)). The
Worker forwards every HTTP request to a shared container instance; the container
runs the same NestJS app as local dev, flipped into cloud mode via env vars
(D1 over HTTP, R2 blobs, Cloudflare Queues, Workers AI, Weaviate Cloud).

```
client ──HTTP──▶ berkdoc-api (Worker) ──▶ BerkdocApiContainer (DO) ──▶ NestJS container :3000
                                                                          │
                                  D1 · R2 · Queues · Workers AI · Weaviate Cloud
```

WebSocket board sync is handled by the separate [`../sync-worker`](../sync-worker)
(Durable Objects); this Worker only serves the REST/HTTP API.

## Status

- **Validated locally**: the backend image builds and boots in full cloud mode
  (D1 + Workers AI + Weaviate Cloud verified via `docker run`); this Worker
  typechecks (`bun run typecheck`) and `wrangler deploy --dry-run` succeeds
  (config + image build resolve, all bindings present).
- **Live deploy pending**: Cloudflare Containers require the **Workers Paid
  plan** ($5/mo). The account is currently on the free plan, so `wrangler
  deploy` (without `--dry-run`) will be rejected until the plan is upgraded.

## Deploy (once on Workers Paid)

1. Install deps: `bun install`
2. Set secrets (not committed):
   ```
   wrangler secret put CLOUDFLARE_API_TOKEN
   wrangler secret put JWT_SECRET
   wrangler secret put WEAVIATE_CLOUD_URL
   wrangler secret put WEAVIATE_CLOUD_API_KEY
   wrangler secret put GOOGLE_CLIENT_ID
   wrangler secret put GOOGLE_CLIENT_SECRET
   wrangler secret put GOOGLE_CALLBACK_URL   # https://api.berkdoc.com/auth/google/callback
   wrangler secret put FRONTEND_URL          # https://app.berkdoc.com
   ```
   Non-secret config lives in `wrangler.toml` `[vars]`.
3. Deploy: `bun run deploy` (builds the Docker image and pushes it + the Worker).
4. Route `api.berkdoc.com` to this Worker (Phase 4c), and add the
   `GOOGLE_CALLBACK_URL` above to the Google OAuth client's authorized redirect
   URIs.

## Scaling note

The Worker routes to a single shared container instance so the in-process event
listeners + queue consumer stay coherent. To scale horizontally, move the queue
consumer to a dedicated consumer Worker (`EVENT_BUS_CONSUMER=false` on the API)
and raise `max_instances`. See `ARCHITECTURE.md`.
