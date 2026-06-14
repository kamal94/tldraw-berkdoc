# BerkDoc Architecture & Decision Record

Status: **Accepted (target architecture)** — supersedes ad-hoc setup. This is a living document; update it as decisions change.

This file records the architecture we are migrating toward and, importantly, **what we prioritized and why**. Detailed migration steps live in the migration plan docs; this is the durable record of decisions.

> **Decision history:** We initially evaluated AWS (portability-first for private installs), then **pivoted to Cloudflare** because tldraw's real-time sync is first-class on Cloudflare **Durable Objects** and we are comfortable **deferring the portable/containerized build until enterprise deals require it**. The remaining component decisions are now **locked** (see §2/§5).

---

## 1. What we are optimizing for (priorities, in order)

1. **Best real-time collaboration with least custom work.** tldraw ships an **official Cloudflare Durable Objects sync backend**. Durable Objects natively provide "exactly one in-memory actor per board" — the model tldraw is built around — so we get production-grade sync without reimplementing authoritative reconciliation. This is the #1 driver of the platform choice.
2. **Serverless velocity & cost.** Near-zero cold starts (Workers isolates), scale-to-near-zero idle (DO hibernation, D1, R2 zero-egress), and fewer moving parts. Optimize for shipping speed and low run-rate at startup scale.
3. **Smallest data migration.** The app already uses SQLite; **D1 is SQLite**, so the DB port is far smaller than a move to Postgres.
4. **Low-lift local development.** A developer should still run the app locally with minimal setup and **no Cloudflare account required**, via environment-driven adapters + Wrangler/Miniflare emulation.
5. **Keep an enterprise/portable path open — later.** Private/segregated installations (single-tenant, BYOC, on-prem/air-gapped) are a *future* requirement. We accept Cloudflare lock-in now and will build portable, containerized equivalents when enterprise deals arrive (see §7). Choosing to run the API in **Cloudflare Containers** (below) means the API tier is already close to that portable form.

### Why Cloudflare over AWS (for this stage)
- **Realtime:** tldraw → Durable Objects is officially supported and dramatically simpler than the AWS options. On AWS the realistic choices were a stateful **Fargate** container (not truly serverless; ~$30–80/mo floor early) or a from-scratch stateless reimplementation on API Gateway WebSockets + Lambda + DynamoDB (high risk; abandons tldraw's `TLSocketRoom`).
- **DB migration:** D1 (SQLite) ≈ our current `bun:sqlite`, vs a full SQLite→Postgres rewrite on AWS.
- **Cost/latency:** lower idle cost and edge latency at startup scale.

### The accepted tradeoff
Cloudflare's primitives (**Durable Objects, D1, Workers AI**) run **only on Cloudflare's network** — they cannot be self-hosted, deployed into a customer VPC/account, or run on-prem/air-gapped. That conflicts with private installs. **We are explicitly deferring that requirement**; §7 records the portable track we will build later, and we keep abstractions now so that track is feasible rather than a rewrite.

---

## 2. Target architecture (decided)

| Concern | Decision (Cloudflare SaaS) | Notes / future portable form (deferred) |
|---|---|---|
| Frontend hosting | **Cloudflare Pages** (`app.berkdoc.com`) | Plain Vite SPA output; portable to any CDN later |
| Realtime sync (tldraw) | **Durable Objects** — one `BoardRoom` DO per board, WebSocket Hibernation, snapshot in DO storage/D1/R2 | The headline win. Portable later → containerized Node `TLSocketRoom` |
| App notifications WS (SmartExplorer, scan stats) | **Worker WebSocket** | Server→client notifications. *Impl note:* pushing to a specific connected user typically needs a small backing DO or pub/sub — validate in Phase 4 |
| REST API | **NestJS as-is in Cloudflare Containers** (`api.berkdoc.com`), fronted by a routing Worker | Less rework than a Hono rewrite; the container **is** the enterprise/portable form pulled forward. *Impl note:* D1 reached via D1 **HTTP API** (or a thin Worker binding) since the container isn't a Worker |
| Relational DB | **D1** (SQLite) + Wrangler migrations | Minimal dialect change off `bun:sqlite`. Portable later → Postgres |
| Vector DB | **Weaviate Cloud** (serverless), called over HTTPS | Keeps the original "serverless Weaviate" goal and stays self-hostable for enterprise |
| Embeddings | **Workers AI** (`@cf/baai/bge-*`) for SaaS, behind a provider abstraction | **MiniLM kept** for local dev + future air-gap. Dimension change (bge vs 384-dim MiniLM) → one-time re-embed |
| Async pipeline | **Cloudflare Queues** + consumer Workers (DLQs) behind an `EventBus` abstraction | Local = in-process EventEmitter; portable later = broker (Redis/RabbitMQ) |
| Object storage (blobs/avatars) | **R2** (S3-compatible, zero egress) via existing `AvatarStorageAdapter` | Adapter already exists; MinIO/S3 for portable later |
| Secrets/config | **Workers Secrets / Secrets Store** (+ container env) | `@nestjs/config`-compatible loading; env files locally |
| Auth | **JWT + Google OAuth** (unchanged) | Enterprise SSO (SAML/OIDC) deferred |
| Document clustering (Python HDBSCAN) | **Removed / out of scope for now** | Scripts remain in repo but are not deployed; revisit later (likely Containers if reintroduced) |
| DNS / TLS | **Cloudflare DNS + universal TLS** (zone already on Cloudflare) | Just need routing/records for `app` + `api` |
| IaC / deploy | **Wrangler** + **Cloudflare Terraform provider**; **GitHub Actions** with Cloudflare API tokens | |

---

## 3. Realtime via Durable Objects (the headline change)

- Adopt tldraw's **Cloudflare DO sync** pattern: a `BoardRoom` Durable Object keyed by `boardId`; Cloudflare guarantees a single instance globally per board, so room state lives in the DO (replacing the in-memory `Map` + persistent `ws` server in `boards.room-manager.ts` / `boards.gateway.ts`).
- **WebSocket Hibernation** so idle boards cost ~nothing.
- Snapshots persist to **DO storage** (or D1/R2) instead of debounced SQLite writes.
- A routing Worker validates JWT + board access, then routes the WebSocket to the correct DO.
- The **app notifications** channel (`app.gateway`) becomes a **Worker WebSocket** (see impl note in §2).

---

## 4. Cross-cutting design rules

- **Environment-driven adapters.** One codebase; behavior selected by env: DB driver (SQLite/D1), `EventBus` (in-process vs Queues), embedding provider (MiniLM vs Workers AI), blob storage (FS/R2), Weaviate connection (local vs cloud), secrets source. This is what keeps both **low-lift local dev** and the **future portable track** feasible.
- **Local dev requires no Cloudflare account.** Absence of CF env vars = local mode: SQLite, in-process events, local Weaviate (docker), MiniLM embeddings, local/FS blobs, and the existing Node WS sync server. **Wrangler/Miniflare** optionally emulate D1/Queues/DO/R2/Workers AI for cloud-fidelity testing.
- **Keep business logic decoupled from Cloudflare bindings.** NestJS services/domain code should not import Workers/DO APIs directly — go through adapters — so the deferred container track is a re-wiring, not a rewrite. (Running the API in Containers already preserves most of this.)
- **Migrations are explicit** (Wrangler D1 migrations), replacing the in-code `CREATE TABLE IF NOT EXISTS` + ad-hoc `ALTER TABLE` logic.
- **Embeddings keep an offline path** (MiniLM) so the future air-gapped track works without external AI APIs.

---

## 5. Decisions log

**Locked:**
- API runtime → **NestJS in Cloudflare Containers** (not a Hono/Workers rewrite).
- Vectors → **Weaviate Cloud**.
- Embeddings → **Workers AI (bge) for SaaS, MiniLM for local/air-gap**.
- App notifications → **Worker WebSocket**.
- Python HDBSCAN → **removed for now** (out of scope).
- DNS → **already on Cloudflare**; only routing/records remain.
- Auth → **JWT + Google OAuth** (no change now).
- Existing data → **migrate production SQLite → D1**.
- CI/CD → **GitHub Actions + Wrangler/Cloudflare API tokens**.

**Inputs still needed (operational, not architectural):**
1. **Production SQLite DB** file (or access) for the D1 data migration.
2. **Cloudflare API token** (scoped) + account/zone IDs for deploys.
3. **Google OAuth** — confirm who owns the Google Cloud project / that we can add `https://api.berkdoc.com/auth/google/callback` to the authorized redirect URIs.

---

## 6. Phased migration plan (summary)
- **Phase 0 — Foundations:** Wrangler/Terraform skeleton, Cloudflare API token, Weaviate Cloud cluster, routing/records under the existing CF zone.
- **Phase 1 — DB → D1:** port `bun:sqlite` to a D1-capable data layer + Wrangler migrations; keep local SQLite. Migrate production data SQLite → D1.
- **Phase 2 — Externalize state:** R2 avatar adapter; `EventBus` → Cloudflare Queues; embedding provider → Workers AI; Weaviate cloud-capable connect.
- **Phase 3 — Realtime → Durable Objects:** implement `BoardRoom` DO + routing Worker; move app-notifications to a Worker WS; migrate snapshots.
- **Phase 4 — API:** package NestJS into **Cloudflare Containers** behind the routing Worker at `api.berkdoc.com`; wire D1/Queues/R2/Weaviate/secrets.
- **Phase 5 — Frontend:** Pages at `app.berkdoc.com`; update Google OAuth redirect URIs.
- **Phase 6 — Cutover:** CI/CD (GitHub Actions + Wrangler), observability (Workers Analytics/Logpush), smoke/load test, route `app`/`api` records.

---

## 7. Deferred enterprise / portable track (when enterprise deals arrive)

Private installs (single-tenant, BYOC, on-prem/air-gapped) are **out of scope for v1** but planned for. Because Cloudflare-native primitives can't be self-hosted, the enterprise track will swap them for portable equivalents — feasible *because* of the §4 abstractions (and the API already runs as a container):

| Cloudflare-native (now) | Portable equivalent (enterprise track) |
|---|---|
| Durable Objects (sync) | Containerized Node `TLSocketRoom` (Docker/K8s) |
| D1 | PostgreSQL |
| Workers AI (embeddings) | MiniLM in-container (offline) |
| Weaviate Cloud | Self-hosted Weaviate |
| R2 | S3-compatible / MinIO |
| Cloudflare Queues | Redis Streams / RabbitMQ |
| NestJS in CF Containers | Same NestJS container on customer infra |

We accept that this is a **dual-track** future (CF-native SaaS + portable enterprise stack) and will budget the extra engineering when the first qualifying deal lands.

---

## 8. References
- `berkdoc-cloudflare-serverless-migration-plan.md` — detailed Cloudflare migration & phasing.
- `berkdoc-aws-serverless-migration-plan.md` — AWS alternative (not chosen).
- `berkdoc-aws-vs-cloudflare-comparison.md` — platform comparison.
- `berkdoc-enterprise-private-install-aws-vs-cloudflare.md` — private-install analysis (informs the deferred §7 track).
