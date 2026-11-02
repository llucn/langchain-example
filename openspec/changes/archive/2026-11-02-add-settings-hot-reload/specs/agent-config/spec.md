## ADDED Requirements

### Requirement: Runtime reload
The system SHALL be able to replace the running Agent Config with a newly loaded one without restarting the process, using the same resolution, validation and snapshot caching as at startup. The replacement SHALL be atomic: a turn that started before it SHALL finish using the config it started with, and turns started after it SHALL use the new one. A failed reload SHALL leave the running config unchanged. The values of `CONFIG_SOURCE`, `CONFIG_REF`, `CONFIG_GITHUB_TOKEN` and `CONFIG_GITHUB_API_URL` that a reload uses SHALL be the effective values of the `runtime-settings` capability, so that a stored value replaces the environment variable of the same name and the environment variables remain the defaults.

#### Scenario: Successful reload
- **WHEN** a reload is requested for a ref that resolves to a new valid commit
- **THEN** new turns use agents, MCP servers and settings from that commit and chat logs record its ref and commit ID

#### Scenario: Failed reload
- **WHEN** the reload fails (unreachable repository, unknown ref, invalid config)
- **THEN** the running config is unchanged and the error names the reference and the source

#### Scenario: Turn in progress
- **WHEN** a reload completes during a running turn
- **THEN** that turn continues and is logged with the config it started with

#### Scenario: Environment defaults
- **WHEN** no stored value exists for `CONFIG_REF`
- **THEN** a reload uses the `CONFIG_REF` environment variable
