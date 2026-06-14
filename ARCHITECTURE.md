# BerkDoc Architecture & Decision Record

Status: **Accepted (target architecture)** — supersedes ad-hoc setup. This is a living document; update it as decisions change.

This file records the architecture we are migrating toward and, importantly, **what we prioritized and why**. Detailed migration steps live in the migration plan docs; this is the durable record of decisions.

> **Decision history:** We initially evaluated AWS (portability-first for private installs). We have **pivoted to Cloudflare** because tldraw's real-time sync is first-class on Cloudflare **Durable Objects**, and we are comfortable **deferring the portable/containerized build until enterprise deals require it**. See §1 for the reasoning and §7 for what the deferred enterprise track entails.

---

## 1. What we are optimizing for (priorities, in order)

1. **Best real-time collaboration with least custom work.** tldraw ships an **official Cloudflare Durable Objects sync backend**. Durable Objects natively provide "exactly one in-memory actor per board" — the model tldraw is built around — so we get production-grade sync without reimplementing authoritative reconciliation. This is the #1 driver of the platform choice.
2. **Serverless velocity & cost.** Near-zero cold starts (Workers isolates), scale-to-near-zero idle (DO hibernation, D1, R2 zero-egress), and fewer moving parts. Optimize for shipping speed and low run-rate at startup scale.
3. **Smallest data migration.** The app already uses SQLite; **D1 is SQLite**, so the DB port is far smaller than a move to Postgres.
4. **Low-lift local development.** A developer should still run the app locally with minimal setup and **no Cloudflare account required**, via environment-driven adapters + Wrangler/Miniflare emulation.
5. **Keep an enterprise/portable path open — later.** Private/segregated installations (single-tenant, BYOC, on-prem/air-gapped) are a *future* requirement. We accept Cloudflare lock-in now and will build portable, containerized equivalents when enterprise deals arrive (see §7).

### Why Cloudflare over AWS (for this stage)
- **Realtime:** tldraw → Durable Objects is officially supported and dramatically simpler than the AWS options. On AWS the realistic choices were a stateful **Fargate** container (not truly serverless; ~$30–80/mo floor early) or a from-scratch stateless reimplementation on API Gateway WebSockets + Lambda + DynamoDB (high risk; abandons tldraw's `TLSocketRoom`).
- **DB migration:** D1 (SQLite) ≈ our current `bun:sqlite`, vs a full SQLite→Postgres rewrite on AWS.
- **Cost/latency:** lower idle cost and edge latency at startup scale.

### The accepted tradeoff
Cloudflare's app/data primitives (**Durable Objects, D1, Workers AI, Vectorize**) run **only on Cloudflare's network** — they cannot be self-hosted, deployed into a customer VPC/account, or run on-prem/air-gapped. That conflicts with private installs. **We are explicitly deferring that requirement**; §7 records the portable track we will build later, and we keep abstractions now so that track is feasible rather than a rewrite.

---

## 2. Target architecture (decided)

| Concern | Decision (Cloudflare SaaS) | Notes / future portable form (deferred) |
|---|---|---|
| Frontend hosting | **Cloudflare Pages** (`app.berkdoc.com`) | Plain Vite SPA output; portable to any CDN later |
| Realtime sync (tldraw) | **Durable Objects** — one `BoardRoom` DO per board, WebSocket Hibernation, snapshot in DO storage/D1/R2 | The headline win. Portable later → containerized Node `TLSocketRoom` |
| App notifications WS (SmartExplorer, scan stats) | **Durable Object (per-user) or Workers + WS** | Simple server→client; could also be SSE |
| REST API | **Workers-native (Hono), incrementally ported from NestJS** — *key open decision, see §5* | Reuse NestJS services/business logic; alternative = Cloudflare Containers (this is also the enterprise/portable form) |
| Relational DB | **D1** (SQLite) + Wrangler migrations | Minimal dialect change off `bun:sqlite`. Portable later → Postgres |
| Vector DB | **Weaviate Cloud** (serverless), called over HTTPS | Keeps original "serverless Weaviate" goal; self-hostable for enterprise. (Vectorize considered but is CF-only — avoid for portability) |
| Embeddings | **Workers AI** (`@cf/baai/bge-*`) behind a provider abstraction | Keep **MiniLM** provider for local/offline + future air-gap |
| Async pipeline | **Cloudflare Queues** + consumer Workers (DLQs) behind an `EventBus` abstraction | Local = in-process EventEmitter; portable later = broker (Redis/RabbitMQ) |
| Object storage (blobs/avatars) | **R2** (S3-compatible, zero egress) via existing `AvatarStorageAdapter` | Adapter already exists; MinIO/S3 for portable later |
| Secrets/config | **Workers Secrets / Secrets Store** | `@nestjs/config`-compatible loading; env files locally |
| Scheduled / Python ML (HDBSCAN) | **Cron Triggers** for scheduling; HDBSCAN has **no clean Workers home** → run in **Cloudflare Containers (beta)** or an external batch job | Known weak spot; revisit |
| DNS / TLS | **Cloudflare DNS + universal TLS** (native) | `app.berkdoc.com`, `api.berkdoc.com` |
| IaC / deploy | **Wrangler** + **Cloudflare Terraform provider** | GitHub Actions pipeline |

---

## 3. Realtime via Durable Objects (the headline change)

- Adopt tldraw's **Cloudflare DO sync** pattern: a `BoardRoom` Durable Object keyed by `boardId`; Cloudflare guarantees a single instance globally per board, so room state lives in the DO (replacing the in-memory `Map` + persistent `ws` server in `boards.room-manager.ts` / `boards.gateway.ts`).
- **WebSocket Hibernation** so idle boards cost ~nothing.
- Snapshots persist to **DO storage** (or D1/R2) instead of debounced SQLite writes.
- A Worker validates JWT + board access, then routes the WebSocket to the correct DO.
- The `app.gateway` (SmartExplorer/live stats) becomes a per-user DO or a Worker WS/SSE channel.

This is the one piece most worth rewriting; it removes the stateful-scaling and board-affinity problems entirely.

---

## 4. Cross-cutting design rules

- **Environment-driven adapters.** One codebase; behavior selected by env: DB driver (SQLite/D1), `EventBus` (in-process vs Queues), embedding provider (MiniLM vs Workers AI), blob storage (FS/R2), Weaviate connection (local vs cloud), secrets source. This is what keeps both **low-lift local dev** and the **future portable track** feasible.
- **Local dev requires no Cloudflare account.** Absence of CF env vars = local mode: SQLite, in-process events, local Weaviate (docker), MiniLM embeddings, local/FS blobs, and the existing Node WS sync server. **Wrangler/Miniflare** optionally emulate D1/Queues/DO/R2/Workers AI for cloud-fidelity testing.
- **Keep business logic decoupled from Cloudflare bindings.** NestJS services/domain code should not import Workers/DO APIs directly — go through adapters — so the deferred container track is a re-wiring, not a rewrite.
- **Migrations are explicit** (Wrangler D1 migrations), replacing the in-code `CREATE TABLE IF NOT EXISTS` + ad-hoc `ALTER TABLE` logic.
- **Embeddings keep an offline path** (MiniLM) so the future air-gapped track works without external AI APIs.

---

## 5. Open decisions (to resolve before/early in migration)

1. **API runtime (biggest decision).** Workers ≠ full Node, so full NestJS won't run cleanly on Workers. Choose:
   - **(A) Rewrite the HTTP layer to Hono on Workers** (most serverless/CF-native; reuse NestJS services as plain modules). Recommended given the "Cloudflare-native now, containerize later" direction.
   - **(B) Run NestJS as-is in Cloudflare Containers now** (less rework, but Containers are newer/heavier and this is essentially the enterprise/portable form pulled forward).
2. **Vectors** — keep **Weaviate Cloud** (recommended; serverless + self-hostable later) vs migrate to **Vectorize** (CF-native but not portable).
3. **Embeddings default** — Workers AI (bge) for SaaS with MiniLM kept for local/air-gap; note dimension change (e.g. bge-base 768 vs MiniLM 384) → one-time re-embed.
4. **App notifications channel** — Durable Object vs Worker WS vs SSE.
5. **Python HDBSCAN** — Cloudflare Containers (beta) vs external batch job.
6. **Domain & DNS** — move `berkdoc.com` DNS to Cloudflare; Google OAuth client ownership/redirect URIs.
7. **Auth roadmap** — keep JWT + Google OAuth now; enterprise SSO (SAML/OIDC) later?
8. **Existing data** — production SQLite data to migrate to D1, or greenfield?
9. **CI/CD** — GitHub Actions + Wrangler/Cloudflare API tokens.

---

## 6. Phased migration plan (summary)
- **Phase 0 — Foundations:** Cloudflare account, domain on CF DNS, Wrangler/Terraform skeleton, Weaviate Cloud cluster.
- **Phase 1 — DB → D1:** port `bun:sqlite` to D1 binding + D1 migrations; keep local SQLite. (Smaller than the AWS Postgres port.)
- **Phase 2 — Externalize state:** R2 avatar adapter; `EventBus` → Cloudflare Queues; embedding provider → Workers AI; Weaviate cloud-capable connect.
- **Phase 3 — Realtime → Durable Objects:** implement `BoardRoom` DO + auth Worker routing; migrate snapshots. (Highest-value change.)
- **Phase 4 — API:** resolve §5.1 → Hono/Workers (or Containers) at `api.berkdoc.com`.
- **Phase 5 — Frontend:** Pages at `app.berkdoc.com`; update Google OAuth redirect URIs.
- **Phase 6 — Ancillary + cutover:** Python clustering (Containers/external), cron, observability (Workers Analytics/Logpush), load test, DNS cutover.

---

## 7. Deferred enterprise / portable track (when enterprise deals arrive)

Private installs (single-tenant, BYOC, on-prem/air-gapped) are **out of scope for v1** but planned for. Because Cloudflare-native primitives can't be self-hosted, the enterprise track will swap them for portable equivalents — feasible *because* of the §4 abstractions:

| Cloudflare-native (now) | Portable equivalent (enterprise track) |
|---|---|
| Durable Objects (sync) | Containerized Node `TLSocketRoom` (Docker/K8s) |
| D1 | PostgreSQL |
| Workers AI (embeddings) | MiniLM in-container (offline) |
| Vectorize / Weaviate Cloud | Self-hosted Weaviate |
| R2 | S3-compatible / MinIO |
| Cloudflare Queues | Redis Streams / RabbitMQ |
| Workers/Hono API | Same business logic in a NestJS container |

We accept that this is a **dual-track** future (CF-native SaaS + portable enterprise stack) and will budget the extra engineering when the first qualifying deal lands. Keeping domain logic decoupled from CF bindings now is what keeps that future cost manageable.

---

## 8. References
- `berkdoc-cloudflare-serverless-migration-plan.md` — detailed Cloudflare migration & phasing.
- `berkdoc-aws-serverless-migration-plan.md` — AWS alternative (not chosen).
- `berkdoc-aws-vs-cloudflare-comparison.md` — platform comparison.
- `berkdoc-enterprise-private-install-aws-vs-cloudflare.md` — private-install analysis (informs the deferred §7 track).
