## Why

All settings live in environment variables, so changing the config repository ref, the GitHub token or the model of the improvement agents means editing the deployment and restarting the API. Admins who simply want to move to a new config tag, rotate a token or try another evolution model have to ask whoever operates the deployment. This change lets admins change these settings in the web app and apply them to the running API without a restart.

## What Changes

- New first-level menu **Settings** (admin only) with a page that groups six settings:
  - **GitHub connection**: `CONFIG_GITHUB_API_URL`, `CONFIG_GITHUB_TOKEN`
  - **Agent Config source**: `CONFIG_SOURCE`, `CONFIG_REF`
  - **Improvement agents**: `EVOLUTION_MODEL`, `EVOLUTION_MAX_TOKENS`
- `CONFIG_REF` is a dropdown of the branches and tags of the configured repository (read through the GitHub API with the values currently in the form).
- `CONFIG_GITHUB_TOKEN` is a password field; it is never sent back to the browser, and leaving it empty keeps the stored token.
- Saved values are stored in the database and override the environment variable of the same name; the environment stays the default for anything not overridden. A setting can be reset to its environment value.
- **Hot refresh**: saving applies the values to the running process. Config source changes load, validate and swap the Agent Config atomically (a failed load changes nothing and reports why); evolution settings apply to the next improvement run. Chats already running finish on the config they started with; new turns use the new one.
- With several API instances, a change is broadcast so every instance refreshes.
- The token is stored encrypted and is never logged, returned or recorded in snapshots.

## Capabilities

### New Capabilities
- `runtime-settings`: admin-managed, persisted overrides for the six settings, the Settings page, the refs dropdown, secret handling, validation and hot refresh.

### Modified Capabilities
- `agent-config`: the Agent Config can be reloaded while the process runs (new requirement); `CONFIG_SOURCE`, `CONFIG_REF`, `CONFIG_GITHUB_TOKEN` and `CONFIG_GITHUB_API_URL` are the environment defaults that a stored override replaces.

## Impact

- API: new `settings` module (service, controller `/admin/settings`, `/admin/settings/refs`), `app_settings` table (migration), encryption helper, Redis pub/sub notification; `AgentConfigService` becomes a swappable, atomically replaced snapshot behind a provider; `GitHubClient` gains a refs listing; evolution caller reads settings per call instead of the startup `AppEnv`.
- Web: Settings entry in the admin navigation and route, settings form with grouped fields, refs dropdown and password field.
- Environment: new `SETTINGS_ENCRYPTION_KEY` (32-byte key, base64) enabling storage of the token; without it the other five settings still work and the token stays environment-only. Documented in `.env.example`, README and the AWS deployment guide/infra.
- Out of scope: other environment variables (database, Redis, auth, model connection), settings history/rollback UI, free-text commit IDs in the ref dropdown, per-user settings.
