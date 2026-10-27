# langchain-example

Monorepo skeleton: **NestJS** API + **React** web + shared TypeScript package, with PostgreSQL (pgvector), Redis, Traefik gateway and OIDC (AWS Cognito) authentication.

| Area     | Choice                                                                            |
| -------- | --------------------------------------------------------------------------------- |
| OS       | Windows, Linux, macOS                                                             |
| Runtime  | Node.js 22, TypeScript, pnpm workspace                                            |
| API      | NestJS (`apps/api`), port `3000`, prefix `/api`, Swagger at `/docs` (non-prod)    |
| Web      | React + Vite (`apps/web`), port `4200`, `HashRouter`, dev proxy `/api` → API      |
| Shared   | `packages/shared` (`@app/shared`): types/constants, built as CJS + ESM            |
| Database | PostgreSQL 16 (`pgvector/pgvector:pg16`), TypeORM, SSL option for AWS RDS         |
| Cache    | Redis 7 (`redis:7-alpine`), password, configurable DB, TLS option for ElastiCache |
| Gateway  | Traefik (docker compose), routes by path: `/api`, `/docs` → api, `/` → web        |
| Auth     | OIDC / AWS Cognito (Authorization Code + PKCE in web, JWT verification in API)    |

## Code structure

```
.
├── apps/
│   ├── api/                      NestJS backend
│   │   ├── src/
│   │   │   ├── main.ts           bootstrap: prefix /api, validation, Swagger
│   │   │   ├── config/           env loading (root .env) + typed config
│   │   │   ├── database/         TypeORM options, data-source, entities, migrations, scripts
│   │   │   ├── redis/            ioredis provider
│   │   │   ├── auth/             Cognito JWT guard (global), @Public(), /api/auth/me
│   │   │   └── health/           GET /api/health (checks DB + Redis)
│   │   └── test/                 e2e tests
│   └── web/                      React + Vite frontend
│       └── src/                  HashRouter app, AuthProvider (oidc-client-ts), pages, api client
├── packages/shared/              shared types & constants (dist/cjs + dist/esm)
├── docker/                       Dockerfile.api, Dockerfile.web
├── docker-compose.yml            api, web, db, redis, traefik
├── .env.example                  config template (committed)
└── tsconfig.base.json            shared TS options (incremental compilation enabled)
```

The build uses TypeScript **incremental** compilation: each project writes a `.tsbuildinfo` (in `dist/` for `shared`/`api`, in `node_modules/.cache/` for `web`), so repeated builds only recompile what changed. `pnpm clean` removes them.

## Configuration

Both API and web read the **same root `.env`** (git-ignored). Create it from the template:

```bash
cp .env.example .env        # Windows PowerShell: Copy-Item .env.example .env
```

Key variables (see `.env.example` for all):

| Variable                                                 | Purpose                                                       |
| -------------------------------------------------------- | ------------------------------------------------------------- |
| `API_PORT`, `WEB_PORT`, `HTTP_PORT`                      | API (3000), web dev (4200), Traefik (80)                      |
| `DB_HOST/PORT/NAME/USER/PASSWORD`                        | PostgreSQL connection                                         |
| `DB_SSL`, `DB_SSL_REJECT_UNAUTHORIZED`, `DB_SSL_CA_PATH` | SSL for AWS RDS (use the RDS CA bundle path for verification) |
| `DB_MIGRATIONS_RUN`                                      | run pending migrations when the API starts                    |
| `REDIS_HOST/PORT/PASSWORD/DB`, `REDIS_TLS`               | Redis; `REDIS_TLS=true` for ElastiCache in-transit encryption |
| `AUTH_ENABLED`                                           | `false` disables token verification (local dev only)          |
| `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_COGNITO_DOMAIN`   | Cognito settings (shared by API and web; no secrets)          |

### Cognito setup

1. Create a User Pool and an **app client without a client secret** (public SPA client).
2. Allowed callback URL / sign-out URL: `http://localhost:4200/` (and your deployed URL). Enable Authorization Code grant and the OAuth scopes you request (default `openid email`; set `OIDC_SCOPE` to add e.g. `profile`). Requesting a scope the app client does not allow fails with `invalid_scope`.
3. Set `OIDC_ISSUER=https://cognito-idp.<region>.amazonaws.com/<userPoolId>`, `OIDC_CLIENT_ID=<app client id>`, `OIDC_COGNITO_DOMAIN=https://<prefix>.auth.<region>.amazoncognito.com`, and `AUTH_ENABLED=true`.

The web app sends the Cognito **ID token** as `Authorization: Bearer …`; the API validates signature (JWKS), issuer and client id. Mark open endpoints with `@Public()`.

## Development

Requirements: Node.js ≥ 22, pnpm (via `corepack enable`), Docker.

```bash
pnpm install
cp .env.example .env
pnpm infra:up          # starts PostgreSQL + Redis containers
pnpm db:create         # create database (if missing)
pnpm migration:run     # apply migrations (creates pgvector extension + tables)
pnpm seed              # optional sample data
pnpm dev               # shared (watch) + api + web
```

- Web: http://localhost:4200 (health page calls `/api/health` through the Vite proxy)
- API: http://localhost:3000/api/health
- Swagger: http://localhost:3000/docs

### Commands

| Command                          | Description                                                                                              |
| -------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `pnpm build`                     | build all packages (shared → api → web)                                                                  |
| `pnpm dev`                       | run shared (watch), api and web together                                                                 |
| `pnpm dev:api` / `pnpm dev:web`  | run one side only                                                                                        |
| `pnpm lint`                      | ESLint                                                                                                   |
| `pnpm checkstyle`                | Prettier check (`pnpm format` to fix)                                                                    |
| `pnpm test`                      | unit tests (api: Jest, web: Vitest)                                                                      |
| `pnpm test:e2e`                  | API e2e tests                                                                                            |
| `pnpm db:create`                 | create the database if it does not exist                                                                 |
| `pnpm db:reset [--redis]`        | drop + recreate the database and run migrations; `--redis` also flushes `REDIS_DB` (never in production) |
| `pnpm migration:generate <Name>` | generate a migration from entity changes                                                                 |
| `pnpm migration:run`             | run pending migrations                                                                                   |
| `pnpm migration:revert`          | revert the last migration                                                                                |
| `pnpm seed`                      | insert seed data                                                                                         |
| `pnpm clean`                     | remove build output and incremental caches                                                               |

## Docker Compose

```bash
docker compose up -d --build
```

Everything is exposed through Traefik on `http://localhost:${HTTP_PORT:-80}`:

| Path              | Service |
| ----------------- | ------- |
| `/api/*`, `/docs` | `api`   |
| `/`               | `web`   |

Inside compose, `DB_HOST=db` and `REDIS_HOST=redis` are set automatically and the API runs migrations on start (`DB_MIGRATIONS_RUN=true`). Swagger is disabled when `NODE_ENV=production`. The web image bakes `OIDC_*` values in at build time. Postgres and Redis ports are also published to the host for local tooling.

Build images individually (context is the repo root):

```bash
docker build -f docker/Dockerfile.api -t app-api .
docker build -f docker/Dockerfile.web -t app-web .
```

## Moving to AWS

- **RDS**: set `DB_HOST` to the endpoint, `DB_SSL=true`, and `DB_SSL_CA_PATH` to the downloaded RDS global CA bundle (keep `DB_SSL_REJECT_UNAUTHORIZED=true`). pgvector is available on RDS PostgreSQL 16; the init migration runs `CREATE EXTENSION vector`.
- **ElastiCache**: set `REDIS_HOST`, `REDIS_TLS=true`, `REDIS_PASSWORD` (AUTH token) and `REDIS_DB` as needed.
