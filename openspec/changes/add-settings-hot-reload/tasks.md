## 1. Storage and effective settings

- [x] 1.1 Add migration and entity `app_settings` (key, value, secret, updated_at, updated_by)
- [x] 1.2 Add AES-256-GCM helper keyed by `SETTINGS_ENCRYPTION_KEY` (versioned format) with unit tests, including wrong key and missing key
- [x] 1.3 Implement `SettingsService`: load rows, merge over `loadEnv()`, expose effective values with origin, set/reset with field validation, redaction of the token in logs/errors
- [x] 1.4 Unit tests: precedence, reset, validation ranges, URL rules, token never in output

## 2. Agent Config hot reload

- [x] 2.1 Make `AgentConfigService` swappable (`replace`, `snapshot`) and add a `fallback` option to `loadAgentConfig` so a new value is verified against the source itself
- [x] 2.2 Make `AgentService` and chat logging take a `snapshot()` once per run
- [x] 2.3 Keep `AppEnv.agentConfig` and `AppEnv.evolution` live (updated in place) so evolution settings are read per call
- [x] 2.4 Tests: failed reload keeps config, in-flight run keeps its instance, new run uses new config

## 3. API

- [x] 3.1 Add `GET/PUT /admin/settings` (admin only): masked token, origins, partial update, `clearGithubToken`, 422 with reason, advisory lock for concurrent saves
- [x] 3.2 Add `POST /admin/settings/refs` using draft source/API URL/token (stored token when empty); add branches/tags listing to `GitHubClient` with capped pagination
- [x] 3.3 Publish `settings:changed` on Redis after save; subscribe and refresh on other instances; periodic `updated_at` check as fallback
- [x] 3.4 Controller tests: 401/403, 422 on invalid field and on invalid config, token not echoed, missing encryption key

## 4. Web

- [x] 4.1 Add admin nav item **Settings** and `/settings` route with not-authorised message for non-admins
- [x] 4.2 Build the Settings page with the three groups, origin badges and "Use environment value"
- [x] 4.3 `CONFIG_REF` dropdown (Branches / Tags groups, current ref always selectable, disabled for a local source, debounced reload on source/URL/token change)
- [x] 4.4 Password field for `CONFIG_GITHUB_TOKEN` (shows "set", empty = unchanged, clear action, disabled without encryption key)
- [x] 4.5 Save flow with inline error, inline confirmation with new version/commit; tests for view helpers

## 5. Docs and deployment

- [x] 5.1 Document `SETTINGS_ENCRYPTION_KEY` and the precedence in `.env.example`, README and `docs/aws-deployment.md`
- [x] 5.2 Pass `SETTINGS_ENCRYPTION_KEY` as an optional secret in the CDK stack (created only when set), `scripts/aws.sh` and the GitHub workflow
- [x] 5.3 Run lint, type-check and all tests
