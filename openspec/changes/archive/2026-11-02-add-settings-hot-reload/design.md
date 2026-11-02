## Context

`loadEnv()` reads `process.env` once at startup into the global `APP_ENV` value. The Agent Config is loaded in a module factory into an immutable `AgentConfigService` that `AgentService`, the multi-agent middleware, the improvement/replay code and chat logging use directly. `createEvolutionCaller(config, env)` reads `env.evolution` per construction. Snapshots of loaded configs are already cached per commit in `agent_config_snapshots`, so a reload of a known commit is cheap. Redis is already a dependency; admin-only endpoints (`@Roles('admin')`) and admin navigation already exist.

## Goals / Non-Goals

**Goals:**
- Admins change the six settings in the UI; they take effect without restart.
- A bad value (unreachable source, unknown ref, invalid config) never breaks the running system.
- The token is write-only for the UI and encrypted at rest.
- Works with more than one API instance.

**Non-Goals:**
- Making every environment variable editable (DB, Redis, auth, model connection stay environment-only).
- Version history of settings, approval flows, per-tenant settings.
- Resolving arbitrary commit IDs through the dropdown.

## Decisions

**Precedence: stored override → environment → built-in default.** Overrides live in a table `app_settings(key PK, value text, secret bool, updated_at, updated_by)`. A key without a row falls through to the environment, so existing deployments behave exactly as before, and "reset" is deleting the row. Alternative: write back to a `.env`/Elastic Beanstalk property — rejected: not possible from inside the container and not durable.

**`SettingsService` is the single source of effective values.** It loads the rows at startup (after migrations), merges them over `loadEnv()` output and exposes `get()` returning an immutable `EffectiveSettings` object plus the origin of each value (`override` | `env` | `default`). `APP_ENV` keeps serving everything that is not hot-refreshable. Consumers read `settings.get()` at the point of use rather than caching it.

**Agent Config swap through a provider.** `AgentConfigService` stays immutable (one loaded config). A new `AgentConfigService` keeps one loaded config that `replace()` swaps as a whole, and `snapshot()` returns a fixed view; the new config is built through the existing `loadAgentConfig` (ref resolution, tarball, validation, snapshot store) and swapped only on success. `AgentService.run` and chat logging take a `snapshot()` at the start of a run and use it for the whole run, so an in-flight turn is never half-old/half-new. Alternative: make `AgentConfigService` mutable — rejected because a run reading `settings` and `agents` at different moments could mix two configs.

**Validate-then-persist-then-swap on save.** `PUT /admin/settings` (partial body) (1) merges the submitted values over the current effective ones, (2) validates field rules (HTTPS URLs, no embedded credentials, `EVOLUTION_MAX_TOKENS` integer within 256–200000, model non-empty), (3) if any of source/ref/token/API URL changed, loads the candidate Agent Config (fallback to a cached snapshot is *not* allowed here, since the point is to verify the new value), (4) in one transaction writes the rows, (5) swaps the provider and publishes `settings:changed` on Redis. Any failure in 2–3 returns 422 with the reason (token redacted) and leaves rows and running config untouched. Concurrent saves are serialised by a Postgres advisory lock. Other instances, on the Redis message, re-read the rows and reload; if their reload fails they keep the old config and log the error (with the ordinary startup rule that the config was just validated by the saving instance, this is rare).

**Dropdown of refs.** `POST /admin/settings/refs` (POST so the draft token travels in the body, never in a URL) takes the draft source/API URL and optionally the draft token, or uses the token in effect when it is empty, and returns `{branches: string[], tags: string[], defaultBranch}` using GitHub `GET /repos/{o}/{r}/branches` and `/tags` (paginated, capped at 300 each, error reported with redacted token). The form refetches when source, API URL or token changes (debounced). The current ref is always shown as an option even if not listed (e.g. a commit ID set through the environment). For a local-directory source the ref control is disabled. Alternative: free-text ref with validation — rejected by the requirement; a dropdown prevents typos.

**Token handling.** `GET /admin/settings` returns `githubToken: {set: boolean, origin}` and never the value. `PUT` treats an absent or empty `githubToken` as "unchanged"; a separate `clearGithubToken: true` removes the stored override (falling back to the environment token). The value is encrypted with AES-256-GCM using `SETTINGS_ENCRYPTION_KEY` (random IV per value, stored as `v1:<iv>:<tag>:<cipher>`). Without a key the API rejects token changes with a clear message and the UI shows the field disabled; other settings still work. Token values are passed through the existing `redactor` in every log and error path.

**Evolution settings are read per call.** The `agentConfig` and `evolution` blocks of the shared `AppEnv` object are updated in place by `SettingsService`, and `createEvolutionCaller`, the improvement service and the config-files provider already read them at the point of use, so a change applies from the next improvement run without any swap logic; runs already in progress keep their values.

**UI.** Admin navigation gains **Settings** (`/settings`), shown and routed for admins only like Log Review. One page, three titled groups (GitHub connection, Agent Config source, Improvement agents), each field showing its origin badge (Stored / Environment / Default) and a "Use environment value" action; a single Save button; an inline confirmation reports the new config version/commit; errors appear inline above the form.

## Risks / Trade-offs

- [Swapping config mid-conversation changes behavior of later turns] → by design for hot refresh; every chat log already records ref and commit of the config an agent ran with, and runs capture one instance.
- [Multi-instance drift if Redis is down at save time] → the saving instance still succeeds; others pick up the rows at next start. Mitigated by also checking `max(updated_at)` on a 60 s timer.
- [Stored token is a high-value secret] → encrypted at rest, write-only API, admin-only, redacted logs; the key stays in the environment/secret manager. Losing the key makes stored tokens unreadable → startup logs a warning and falls back to the environment token.
- [A wrong token/source saved by an admin could break the next restart] → the new values are validated before saving; a later outage falls back to snapshots exactly as today.
- [GitHub API rate limits when listing refs] → capped pagination, debounce, token used when available.

## Migration Plan

1. Deploy with the migration creating `app_settings` (empty). Behavior is unchanged: everything comes from the environment.
2. Optionally set `SETTINGS_ENCRYPTION_KEY` to enable token changes in the UI.
3. Rollback: remove the code; the table is ignored. Overrides stored in it are then no longer applied and the environment values apply again.

## Open Questions

- Should a successful change also be recorded in an audit table beyond `updated_by` and an info log of the changed keys (no values for the token)? Default: no.
