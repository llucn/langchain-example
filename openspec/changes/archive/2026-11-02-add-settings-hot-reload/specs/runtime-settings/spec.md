## ADDED Requirements

### Requirement: Managed settings and precedence
The system SHALL let admins manage six settings at runtime: `CONFIG_GITHUB_API_URL`, `CONFIG_GITHUB_TOKEN`, `CONFIG_SOURCE`, `CONFIG_REF`, `EVOLUTION_MODEL` and `EVOLUTION_MAX_TOKENS`. The effective value of each SHALL be the value stored by an admin if there is one, else the environment variable of the same name, else the built-in default. The system SHALL report for each setting whether its effective value is stored, from the environment or the default.

#### Scenario: No stored value
- **WHEN** no value is stored for `EVOLUTION_MODEL` and the environment sets `EVOLUTION_MODEL=m1`
- **THEN** the effective value is `m1` and its origin is environment

#### Scenario: Stored value wins
- **WHEN** an admin stored `EVOLUTION_MODEL=m2` and the environment sets `m1`
- **THEN** the effective value is `m2` and its origin is stored

#### Scenario: Reset to environment
- **WHEN** an admin resets a stored setting
- **THEN** the stored value is deleted and the environment value (or default) is effective again

### Requirement: Settings page
The web app SHALL provide a first-level menu item **Settings**, visible and routable for admins only, with a page that shows the settings in three titled groups: **GitHub connection** (`CONFIG_GITHUB_API_URL`, `CONFIG_GITHUB_TOKEN`), **Agent Config source** (`CONFIG_SOURCE`, `CONFIG_REF`) and **Improvement agents** (`EVOLUTION_MODEL`, `EVOLUTION_MAX_TOKENS`). Each field SHALL show its effective value and origin and offer to use the environment value.

#### Scenario: Admin opens Settings
- **WHEN** an admin opens Settings
- **THEN** the six settings are shown in the three groups with their effective values (the token only as set / not set)

#### Scenario: Non-admin
- **WHEN** a non-admin views the sidebar or opens the Settings URL
- **THEN** the item is not shown, a not-authorised message is shown for the URL, and no settings are requested

#### Scenario: Admin-only API
- **WHEN** a non-admin calls `/admin/settings` or `/admin/settings/refs`
- **THEN** the system responds 403 (401 when unauthenticated)

### Requirement: Config ref dropdown
The Settings page SHALL present `CONFIG_REF` as a dropdown listing the branches and the tags of the repository named by the current `CONFIG_SOURCE` form value, grouped as Branches and Tags. The list SHALL be read through the GitHub API using the form's API URL and token (the stored token when the token field is empty). The current ref SHALL always be selectable even when it is not in the list. The dropdown SHALL be disabled with an explanation when the source is a local directory.

#### Scenario: Refs listed
- **WHEN** the source is a GitHub repository with branch `main` and tag `v1.0`
- **THEN** the dropdown offers `main` under Branches and `v1.0` under Tags

#### Scenario: Source edited
- **WHEN** an admin changes `CONFIG_SOURCE` to another repository
- **THEN** the dropdown reloads the refs of that repository

#### Scenario: Listing fails
- **WHEN** GitHub rejects the request (e.g. 401/403/404)
- **THEN** the page shows an error that names the repository and hints to check source and token, without the token, and keeps the current ref selectable

#### Scenario: Ref not listed
- **WHEN** the effective ref is a commit ID
- **THEN** it is shown as the selected option

### Requirement: Token input
`CONFIG_GITHUB_TOKEN` SHALL be entered in a password field. The system SHALL never return the token to the browser, only whether one is set. An empty or absent token in a save request SHALL leave the stored token unchanged. An explicit clear request SHALL delete the stored token so the environment value applies. The token SHALL be stored encrypted with the key in `SETTINGS_ENCRYPTION_KEY`; when the key is missing the system SHALL refuse token changes with an explanatory error and the other settings SHALL remain editable.

#### Scenario: Left empty
- **WHEN** an admin saves other changes with the token field empty
- **THEN** the stored token is unchanged

#### Scenario: New token
- **WHEN** an admin enters a token and saves
- **THEN** the token is stored encrypted, used for subsequent GitHub requests, and not present in any response, log line or error

#### Scenario: Clear
- **WHEN** an admin clears the stored token
- **THEN** the stored token is deleted and the environment token (if any) is effective

#### Scenario: No encryption key
- **WHEN** `SETTINGS_ENCRYPTION_KEY` is not set and an admin submits a token
- **THEN** the system responds with an error saying token storage needs the key, and nothing is stored

### Requirement: Validation and atomic hot refresh
On save the system SHALL validate the submitted values before storing anything: `CONFIG_SOURCE` and `CONFIG_GITHUB_API_URL` as for startup (HTTPS, no embedded credentials), `EVOLUTION_MODEL` non-empty, `EVOLUTION_MAX_TOKENS` an integer from 256 to 200000. When a value of the Agent Config source (`CONFIG_SOURCE`, `CONFIG_REF`, token, API URL) changes, the system SHALL load and validate the Agent Config for the new values from the source itself (not from a cached snapshot fallback) before storing them. If validation or loading fails the system SHALL respond 422 with the reason (token redacted), store nothing and keep the running configuration. If it succeeds the system SHALL store the values and replace the running Agent Config in one step, without a restart.

#### Scenario: Move to another tag
- **WHEN** an admin selects tag `v1.1` for `CONFIG_REF` and saves, and the config at `v1.1` is valid
- **THEN** the new values are stored, new chat turns run with the config of `v1.1`, and the response states the new version and commit

#### Scenario: Invalid config at the new ref
- **WHEN** the config at the chosen ref fails validation or the ref cannot be resolved
- **THEN** the response is 422 with the reason, nothing is stored and the previous config stays in use

#### Scenario: Invalid field
- **WHEN** `EVOLUTION_MAX_TOKENS` is `10`
- **THEN** the response is 422 naming the field and nothing is stored

#### Scenario: In-flight chat
- **WHEN** a config swap happens while a chat turn is running
- **THEN** that turn finishes with the config it started with, and its chat log records that config's ref and commit

#### Scenario: Evolution settings
- **WHEN** an admin changes `EVOLUTION_MODEL` and saves
- **THEN** improvement runs started afterwards use the new model without a Agent Config reload

### Requirement: Multi-instance refresh
The system SHALL notify all running API instances when settings change, and each instance SHALL re-read the stored settings and refresh its effective values and Agent Config. An instance that fails to load the new config SHALL keep its current one and log the failure.

#### Scenario: Second instance
- **WHEN** instance A saves a new `CONFIG_REF`
- **THEN** instance B refreshes to the same ref without a restart

#### Scenario: Refresh fails on one instance
- **WHEN** instance B cannot load the new config
- **THEN** it keeps its previous config and logs an error without the token

### Requirement: Settings secrecy and traceability
The system SHALL record who changed settings and when, and SHALL log the names of changed settings but never the token value. Stored settings SHALL be returned only to admins.

#### Scenario: Change recorded
- **WHEN** an admin saves `CONFIG_REF`
- **THEN** the stored row has the admin's identity and time, and an info log names `CONFIG_REF` without values of secret settings
