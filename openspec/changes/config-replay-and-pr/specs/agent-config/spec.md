## MODIFIED Requirements

### Requirement: Private repository access
The system SHALL authenticate to the GitHub API with `CONFIG_GITHUB_TOKEN` when it is set, as a bearer `Authorization` header, and never in a URL. The same token SHALL be used both to read the config and, when an admin publishes an improvement proposal, to create a branch, a commit and a pull request in the config repository; reading needs *Contents* read access and publishing additionally *Contents* and *Pull requests* write access. The system SHALL NOT forward the token to the host the tarball download redirects to, and SHALL refuse a redirect to a host other than a GitHub download host. The token SHALL NOT appear in logs, error messages, snapshots or stored proposals. Writes SHALL never target the repository's default branch directly and SHALL never merge a pull request. Publishing SHALL be unavailable when `CONFIG_SOURCE` is a local directory.

#### Scenario: Token supplied
- **WHEN** `CONFIG_GITHUB_TOKEN` is set and the repository is private
- **THEN** the config is read successfully and no log line or error contains the token

#### Scenario: Token not forwarded
- **WHEN** the tarball request is redirected to the download host
- **THEN** the request to the download host carries no `Authorization` header

#### Scenario: Authentication fails
- **WHEN** the token is invalid or lacks access (HTTP 401/403)
- **THEN** the failure is reported as an access error for the source with a hint to check the token, with the token redacted

#### Scenario: Unexpected redirect target
- **WHEN** the tarball request is redirected to an unrelated host
- **THEN** the download is refused and startup fails or falls back as for an unavailable repository

#### Scenario: Token without write permission
- **WHEN** an admin publishes a proposal and the token lacks write access (HTTP 403 or 404 on a write request)
- **THEN** publishing fails with an error saying the token needs Contents and Pull requests write access, the proposal stays `ready` and the error contains no token value

#### Scenario: Branch only
- **WHEN** a proposal is published
- **THEN** commits are made on a new `improvement/` branch and the pull request is left open

#### Scenario: Local config source
- **WHEN** `CONFIG_SOURCE` is a local directory
- **THEN** publishing is unavailable and no GitHub write request is made
