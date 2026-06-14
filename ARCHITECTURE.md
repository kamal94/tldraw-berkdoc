# BerkDoc Architecture & Decision Record

Status: **Accepted (target architecture)** — supersedes ad-hoc setup. This is a living document; update it as decisions change.

This file records the architecture we are migrating toward and, importantly, **what we prioritized and why**. Detailed migration steps live in the migration plan docs; this is the durable record of decisions.

---

## 1. What we are optimizing for (priorities, in order)

1. **Keep private/enterprise installations possible.** BerkDoc may sell to enterprises that require segregated deployments: dedicated single-tenant instances, deployment into the customer's own cloud account (BYOC), or on-prem/air-gapped installs. This is the **top constraint** and it drives most decisions below.
2. **Serverless-first on AWS — but never at the cost of portability.** Prefer managed/serverless AWS services for our own multi-tenant SaaS, but only where the same component has a **self-hostable fallback**. We avoid AWS-only primitives that would be impossible to replicate in a customer environment.
3. **Low-lift local development.** A developer should still run the app with `docker compose up` + the existing dev flow, with **no cloud account required**. Same codebase runs as a local monolith and as the cloud/split deployment via environment-driven adapters.
4. **Minimize backend rewrite.** Keep the existing NestJS backend largely intact; change infrastructure bindings, not business logic, wherever possible.

### Why AWS over Cloudflare
Cloudflare's app/data primitives (Durable Objects, D1, Workers AI, Vectorize) only run on Cloudflare's shared global network — they cannot be deployed into a customer VPC, a customer's own account, or on-prem/air-gapped. That directly conflicts with priority #1. AWS supports single-tenant (account/VPC per tenant), BYOC (Marketplace / IaC into the customer's account), and on-prem (Outposts, ECS/EKS Anywhere, portable containers). See `berkdoc-enterprise-private-install-aws-vs-cloudflare.md` for the full analysis.

**Guiding principle: "portable by default, managed where convenient."** Every load-bearing component must have (a) a managed AWS form for our SaaS and (b) a self-hostable form for private installs, selected by configuration.

---

## 2. Target architecture (decided)

| Concern | Decision (SaaS form) | Self-hostable fallback (private installs) | Notes |
|---|---|---|---|
| Frontend hosting | S3 + CloudFront (`app.berkdoc.com`) | Static files behind any CDN / nginx | Plain Vite SPA output; portable |
| REST API | NestJS on **AWS Lambda (Node 20)** via serverless-express, API Gateway HTTP API (`api.berkdoc.com`) | Same NestJS image as a **long-running container** | Build target is Node so it runs on Lambda *and* in a container |
| Realtime sync (tldraw) + app WS | **Containerized Node sync server on ECS Fargate** behind ALB | Same container on Docker/K8s on-prem | Deliberately **not** a CF Durable Object — keeps it portable |
| Relational DB | **Aurora Serverless v2 (PostgreSQL)** + RDS Proxy | Vanilla **PostgreSQL** | Migrate off `bun:sqlite`; standard Postgres dialect everywhere |
| Vector DB | **Weaviate Cloud (serverless)** | **Self-hosted Weaviate** (already our local mode) | Weaviate is self-hostable — a deliberate advantage over CF Vectorize |
| Embeddings | Behind a provider abstraction (see §4) | **MiniLM in-container** (`@xenova`, runs offline) | Must support a fully offline/air-gapped path |
| Async pipeline | **SQS** + worker Lambdas (DLQs) behind an `EventBus` abstraction | In-process EventEmitter (local) / portable broker (e.g. Redis/RabbitMQ) for on-prem | Abstraction keeps SQS from being load-bearing for portability |
| Object storage (blobs/avatars) | **S3** (via existing `AvatarStorageAdapter`) | **MinIO** (S3-compatible) or local FS | Adapter interface already exists |
| Secrets/config | **AWS Secrets Manager / SSM** | Env files / Vault | Loaded via `@nestjs/config` from either source |
| Scheduled / Python ML (HDBSCAN) | Lambda container (Python) or Fargate task | Same Python container on-prem | Keep as a container, not a managed-only service |
| DNS / TLS | Route53 + ACM (CloudFront cert in `us-east-1`) | Customer-managed DNS/TLS | |
| IaC | **TBD — see open decisions** (Terraform leaning for BYOC/on-prem portability) | Same IaC parameterized per topology | |

---

## 3. Deployment topologies we are designing for

The same artifacts (Node container image, Postgres schema/migrations, static frontend, Python container) must deploy into all of these:

1. **Managed multi-tenant SaaS** (our default) — serverless AWS, shared infra, logical tenant isolation by `user_id`/tenant.
2. **Single-tenant (silo)** — a dedicated stack per enterprise customer, isolated VPC/account, via parameterized IaC.
3. **BYOC** — deployed into the customer's own AWS account (their data/controls), via IaC/Marketplace.
4. **On-prem / air-gapped** — portable containers + Postgres + self-hosted Weaviate + MinIO + in-container MiniLM embeddings; no outbound dependency on our services.

Implication: **no component may be AWS-only in a way that blocks topologies 2–4.** That is why realtime is Fargate (not Durable Objects), DB is Postgres (not D1), vectors are Weaviate (not Vectorize), and every managed service sits behind an abstraction with a self-hostable implementation.

---

## 4. Cross-cutting design rules

- **Environment-driven adapters.** One codebase; behavior selected by env: DB driver, `EventBus` (in-process vs SQS vs broker), embedding provider, blob storage, Weaviate connection (local vs cloud), secrets source.
- **Runtime target = Node 20 for all deploys**; Bun stays for local dev convenience. The only Bun-specific dependency (`bun:sqlite`) is removed by the Postgres migration.
- **Embeddings must have an offline path.** Whatever managed option we use for SaaS, MiniLM-in-container must remain a supported provider so air-gapped installs work without external AI APIs. (This biases us toward keeping MiniLM as the default and treating any managed embedding service as an optional optimization — pending the open decision in §5.)
- **Migrations are explicit and portable** (standard Postgres migration tooling), replacing the current in-code `CREATE TABLE IF NOT EXISTS` + ad-hoc `ALTER TABLE` logic.
- **Local dev requires no AWS account.** Absence of AWS env vars = local mode (SQLite-or-local-Postgres, in-process events, local Weaviate, MiniLM, local/FS blobs).

---

## 5. Open decisions (to resolve before/early in migration)

These are tracked here so they aren't lost; see the chat thread for current status.

1. **IaC tool** — Terraform (best for BYOC/on-prem portability) vs AWS CDK vs SST. Portability priority leans Terraform.
2. **Embeddings default** — keep MiniLM-in-container as the single default (max portability) vs use Amazon Bedrock for SaaS + MiniLM only for air-gap (dual path, dimension differences, re-embed).
3. **Async transport for on-prem** — which portable broker backs the `EventBus` when SQS isn't available (Redis Streams? RabbitMQ?).
4. **AWS account/org structure & region** — primary region; account-per-tenant strategy for silos; GovCloud only if FedRAMP becomes a target.
5. **Auth roadmap** — keep JWT + Google OAuth now; do enterprise tiers need SAML/OIDC SSO later? Affects auth module design.
6. **Existing data** — is there production SQLite data to migrate, or greenfield? Affects the data-migration step.
7. **Domain & DNS ownership** — is `berkdoc.com` registered and will DNS move to Route53? Google OAuth client ownership/redirect URIs.
8. **Compliance targets & timeline** — SOC2 / HIPAA / FedRAMP affect region, logging, and tenancy choices.
9. **CI/CD** — GitHub Actions + AWS OIDC (assumed) confirmation.

---

## 6. References
- `berkdoc-aws-serverless-migration-plan.md` — detailed AWS migration & phasing.
- `berkdoc-aws-vs-cloudflare-comparison.md` — platform comparison.
- `berkdoc-enterprise-private-install-aws-vs-cloudflare.md` — why AWS for private installs.
