## ADDED Requirements

### Requirement: Replay during generation
After a proposal with a diff has been built, the system SHALL replay its target cases and the regression set (see `config-replay`) before the proposal becomes `ready`, and SHALL store the results with the proposal. A proposal without a diff, or whose tool inventory could not be read, SHALL skip replay and say so in its notes.

#### Scenario: Replay before ready
- **WHEN** a proposal with a diff has been built
- **THEN** its status stays `generating` until the replays have finished or failed, then becomes `ready`

#### Scenario: Notes only
- **WHEN** a proposal has notes and no diff
- **THEN** no replay runs and the proposal becomes `ready`

#### Scenario: No tool inventory
- **WHEN** the proposal has a diff but the tool inventory could not be read
- **THEN** no replay runs, a note says why, and the proposal becomes `ready`

### Requirement: Pull request after human confirmation
The system SHALL open a pull request in the config repository for a `ready` proposal with a diff only after an admin confirms in a dialog that shows the diff, rationale and replay results. It SHALL read the repository's default branch, verify that every file to change still has the content the proposal was computed from (else respond 409 and mark the proposal stale), create the branch `improvement/<short-id>`, create one commit with the proposed files, and open a pull request whose description contains the rationale, the review ids and the replay summary (regressions first). It SHALL NOT merge the pull request or push to the default branch. The status change to `published`, with branch and pull request URL, SHALL be atomic so that a repeated request opens no second pull request. Publishing SHALL use `CONFIG_GITHUB_TOKEN` (see `agent-config`).

#### Scenario: Publish
- **WHEN** an admin confirms the pull request for a `ready` proposal
- **THEN** a branch and pull request are created, the proposal becomes `published` and shows the pull request link

#### Scenario: Config changed meanwhile
- **WHEN** a target file on the default branch differs from the proposal's base
- **THEN** the system responds 409, creates no branch and marks the proposal stale

#### Scenario: Double click
- **WHEN** the publish request is sent twice for the same proposal
- **THEN** exactly one pull request is created and the second call responds 409

#### Scenario: Not available
- **WHEN** the config source is a local directory or no `CONFIG_GITHUB_TOKEN` is set
- **THEN** the page does not offer to create a pull request and the endpoint responds 409

## MODIFIED Requirements

### Requirement: Proposal storage and status
The system SHALL store each proposal with its status (`generating`, `ready`, `failed`, `discarded`, `published`), the agent, the base config commit and source, the creating admin, the path, base text and proposed text of each changed file, the diff, rationale, notes and error, and, once published, the branch and pull request URL; and SHALL store each case with its review id, evidence and diagnosis, and each replay with its proposal (see `config-replay`). At API start proposals still `generating` SHALL be set to `failed`.

#### Scenario: Restart during generation
- **WHEN** the API restarts while a proposal is `generating`
- **THEN** after start the proposal is `failed` with the reason "interrupted"

#### Scenario: Traceability
- **WHEN** an admin opens a proposal
- **THEN** each change can be traced to its cases and the reviews they came from

#### Scenario: Published proposal
- **WHEN** a proposal has been published
- **THEN** it keeps its branch name and pull request URL and cannot be discarded or published again

### Requirement: Proposal review page
The system SHALL give admins a page listing proposals (newest first, with status, agent and creation time) and a detail page showing the diagnoses with evidence, the base config commit and source, the unified diff, the rationale, the notes, the replay results and the status, and offering "Discard" (a `ready` or `failed` proposal) and "Create pull request" (a `ready` proposal with a diff, when publishing is available). For each changed file the page SHALL show its path in the config directory and its full proposed text, and SHALL offer Copy actions for the diff and for each proposed file text. The replay results SHALL state that each side was run once, and `regressed` verdicts SHALL be highlighted. While a proposal is `generating` the page SHALL refresh its status.

#### Scenario: Inspect a proposal
- **WHEN** an admin opens a `ready` proposal
- **THEN** they see per case the diagnosis, the unified diff, the rationale and the replay verdicts

#### Scenario: Copy for manual application
- **WHEN** the admin clicks Copy on a proposed file
- **THEN** the full proposed text of that file is copied to the clipboard

#### Scenario: Discard
- **WHEN** an admin discards a proposal
- **THEN** its status becomes `discarded` and "Create pull request" is no longer offered
