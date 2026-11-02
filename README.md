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

## AWS deployment

`pnpm deploy:aws` deploys the dev stage (Elastic Beanstalk + RDS + ElastiCache + CloudFront) from your machine; see [docs/aws-deployment.md](docs/aws-deployment.md).

## Code structure

```
.
├── apps/
│   ├── api/                      NestJS backend
│   │   ├── src/
│   │   │   ├── main.ts           bootstrap: prefix /api, validation, Swagger
│   │   │   ├── config/           env loading (root .env) + typed config
│   │   │   ├── agent-config/     Agent Config from a GitHub repo: fetch, validate, snapshot cache
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

| Variable                                                 | Purpose                                                             |
| -------------------------------------------------------- | ------------------------------------------------------------------- |
| `API_PORT`, `WEB_PORT`, `HTTP_PORT`                      | API (3000), web dev (4200), Traefik (80)                            |
| `DB_HOST/PORT/NAME/USER/PASSWORD`                        | PostgreSQL connection                                               |
| `DB_SSL`, `DB_SSL_REJECT_UNAUTHORIZED`, `DB_SSL_CA_PATH` | SSL for AWS RDS (use the RDS CA bundle path for verification)       |
| `DB_MIGRATIONS_RUN`                                      | run pending migrations when the API starts                          |
| `REDIS_HOST/PORT/PASSWORD/DB`, `REDIS_TLS`               | Redis; `REDIS_TLS=true` for ElastiCache in-transit encryption       |
| `AUTH_ENABLED`                                           | `false` disables token verification (local dev only)                |
| `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_COGNITO_DOMAIN`   | Cognito settings (shared by API and web; no secrets)                |
| `ADMIN_GROUP`                                            | Cognito group allowed to use Log Review (default `admin`)           |
| `APP_VERSION`                                            | version written to chat logs (default: `apps/api` version)          |
| `CONFIG_SOURCE`, `CONFIG_REF`, `CONFIG_GITHUB_TOKEN`     | Agent Config repository (`url//folder`), branch/tag/commit, token   |
| `EVOLUTION_MODEL`, `EVOLUTION_MAX_TOKENS`                | Model of the improvement agents (default `claude-sonnet-5-5`, 8192) |
| `SETTINGS_ENCRYPTION_KEY`                                | Base64 32-byte key encrypting a GitHub token stored on Settings     |

### Cognito setup

1. Create a User Pool and an **app client without a client secret** (public SPA client).
2. Allowed callback URL / sign-out URL: `http://localhost:4200/` (and your deployed URL). Enable Authorization Code grant and the OAuth scopes you request (default `openid email`; set `OIDC_SCOPE` to add e.g. `profile`). Requesting a scope the app client does not allow fails with `invalid_scope`.
3. Set `OIDC_ISSUER=https://cognito-idp.<region>.amazonaws.com/<userPoolId>`, `OIDC_CLIENT_ID=<app client id>`, `OIDC_COGNITO_DOMAIN=https://<prefix>.auth.<region>.amazoncognito.com`, and `AUTH_ENABLED=true`.

The web app sends the Cognito **ID token** as `Authorization: Bearer …`; the API validates signature (JWKS), issuer and client id. Mark open endpoints with `@Public()`.

### Agent Config

The agents (prompts, model settings, tools), the MCP server URLs and the agent parameters are not in code: at startup the API reads them from a GitHub repository through the GitHub API (`CONFIG_SOURCE` = `https://github.com/<owner>/<repo>.git//<folder>`, `CONFIG_REF` = branch, tag or commit ID, `CONFIG_GITHUB_TOKEN` for a private repository). The ref is resolved to a commit ID; the validated config is cached per commit in `agent_config_snapshots`, so a restart on the same commit does not download anything, and a moved branch or tag is detected at the next start. If GitHub is unavailable the newest snapshot of the same ref is used; an invalid or missing config stops the start. Chat logs record the ref and commit ID of the config an agent ran with. `docs/config-sample/` is the initial content for the config repository (see its README); `CONFIG_SOURCE` may also be a local directory for development, e.g. `CONFIG_SOURCE=docs/config-sample/langchain-example`.

### Settings (hot refresh)

Admins change `CONFIG_GITHUB_API_URL`, `CONFIG_GITHUB_TOKEN`, `CONFIG_SOURCE`, `CONFIG_REF`, `EVOLUTION_MODEL` and `EVOLUTION_MAX_TOKENS` on the **Settings** page (`/settings`, API under `/admin/settings`) without restarting. A stored value overrides the environment variable of the same name; "Use environment value" removes it. `CONFIG_REF` is a dropdown of the repository's branches and tags. The token is a password field that is never returned (empty = unchanged) and is stored encrypted with `SETTINGS_ENCRYPTION_KEY`. On save the new Agent Config is loaded and validated from the source first; a failure changes nothing. Running chat turns finish on the config they started with; other API instances refresh through Redis.

### Chat logs and Log Review

Every chat session and every event of a run (user input, LLM tool use, LLM end turn, agent tool result, run error) is written to `chat_log_*` tables with agent, agent config version/hash, app version and response times; the log is independent of the chat tables and survives deleting a session. Users in the `ADMIN_GROUP` Cognito group see a **Log Review** page (`/log-review`, API under `/admin/chat-logs`) to rate sessions and messages Good/Bad, add comments and tags, and record the expected result of a message. With `AUTH_ENABLED=false` everyone is treated as admin.

### Improvement proposals

Admins turn Bad message reviews into config improvements. On **Log Review**, tick "Use the Bad review ... for improvement" on up to 10 Bad message reviews and click **Generate improvement**; one proposal per agent is created (API under `/admin/improvements`, page `/improvements`). A Case Builder assembles each review (the reviewed turn, earlier turns, tool calls with recorded results, the comment and expected result, and the config snapshot the event ran under); a Diagnosis agent assigns a root-cause layer (`prompt`, `tool_missing`, `tool_config`, `settings`, `routing`, `label_unclear`, `insufficient_evidence`) using the tool inventory of the agent's MCP servers, read with the admin's token (lists only, nothing is called); a Proposal agent then writes the smallest change to the agent files and `settings`, which code checks (no `model`, `env`, `mcpServers` changes, only declared tools, valid config) before it is stored. The proposal page shows diagnoses, diff, rationale and the proposed file texts with Copy buttons; apply it to the config repository by hand, or discard it. The agents use `EVOLUTION_MODEL` over the same model connection as the chat agents.

**Replay and pull request.** After a proposal with a diff is built, each reviewed turn is replayed under the config the event ran under and under the proposed config (plus every Good message review of the same agent as a regression check), and an LLM judge compares both runs with the reviewer's comment and expected result (`improved`, `same`, `regressed`, `inconclusive`). Replay never calls an MCP server: tools answer from the results recorded in the chat log, and a call without a recorded result is not executed (the agent gets a marked placeholder and the call is shown as `unrecorded`). Each side runs once, so verdicts are advisory. Replay needs the MCP tool inventory (tools are read with the admin's token), so it is skipped when authentication is off. **Create pull request** (after a confirmation dialog showing diff, rationale and replay results) creates the branch `improvement/<id>`, one commit and an open pull request in the config repository; it never merges or writes the default branch, and answers 409 if a changed file differs on the default branch (the proposal is then stale). It uses `CONFIG_GITHUB_TOKEN`, which therefore needs _Contents_ and _Pull requests_ write access on the config repository for publishing (read access is enough for everything else); a local-directory `CONFIG_SOURCE` cannot publish.

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
