## ADDED Requirements

### Requirement: Session list for review
The system SHALL give admins a paged list of logged chat sessions, newest first, each with the user, start time, name, app version, number of events, last event time, the agents involved, whether the session was deleted and the numbers of good and bad reviews. The list SHALL be filterable by user, agent, app version, start date range and review state (unreviewed, good, bad).

#### Scenario: Browse sessions
- **WHEN** an admin opens the Log Review page
- **THEN** logged sessions are listed newest first with their review counts

#### Scenario: Filter by review state
- **WHEN** the admin filters on "bad"
- **THEN** only sessions with at least one bad review (session or message) are listed

#### Scenario: Deleted sessions stay visible
- **WHEN** a user deleted a chat session
- **THEN** it is still listed, marked as deleted

### Requirement: Session timeline
The system SHALL show an admin the complete log of one session ordered by sequence number and grouped by turn, with for each event its type, time, agent name, agent config version, duration, content, and for tool use the tool name and arguments and for tool results the tool name and error status. The reviews of the session and of each event SHALL be shown with them.

#### Scenario: Open a session
- **WHEN** the admin selects a session
- **THEN** all its events are shown in order with types, agents, config versions and durations

#### Scenario: Pair call and result
- **WHEN** an event is a tool result
- **THEN** the call it answers is identifiable by the tool call id

### Requirement: Good/Bad review of sessions and messages
An admin SHALL be able to rate a session as a whole and each message event as Good or Bad with the Good and Bad buttons, optionally adding a comment and tags from a fixed list. Each admin has at most one review per target; rating again changes it, and an admin can remove their review. Reviews SHALL be stored apart from the log records and record the reviewer, reviewer type (`human`) and time.

#### Scenario: Rate a message
- **WHEN** the admin clicks Bad on an event and enters a comment
- **THEN** a review with rating bad and the comment is saved for that event and the Bad button shows as selected

#### Scenario: Change a rating
- **WHEN** the same admin later clicks Good on the same event
- **THEN** their review is updated, not duplicated

#### Scenario: Rate the session
- **WHEN** the admin clicks Good in the session header
- **THEN** a session-level review is saved

#### Scenario: Other reviewers
- **WHEN** two admins review the same event
- **THEN** both reviews are kept and each admin edits only their own

### Requirement: Expected result and difference
On a message review an admin SHALL be able to record the expected result (what the agent should have said or done, e.g. the expected tool call or answer) and the difference between the expected and the actual result. These fields SHALL be rejected on session-level reviews.

#### Scenario: Annotate an answer
- **WHEN** the admin rates an `llm_end_turn` event Bad and fills in expected result and difference
- **THEN** both texts are stored with the review and shown with the event

#### Scenario: Session review with expected result
- **WHEN** a session-level review includes an expected result
- **THEN** the system rejects it with 400

### Requirement: Review data is kept for later evaluation
Reviews SHALL be queryable together with their event's agent name, agent config version and config identifier (hash now, Git commit ID later), and SHALL allow a reviewer type other than `human` and an evaluator identifier, so reviews by an LLM can be added later without changing the log.

#### Scenario: Reviews grouped by config
- **WHEN** reviews are joined with their events
- **THEN** each review can be attributed to an agent name and agent config hash

### Requirement: Log review access control
All log review endpoints and the Log Review page SHALL be limited to admins (see `admin-access`).

#### Scenario: Non-admin
- **WHEN** a non-admin calls a log review endpoint
- **THEN** the system responds 403
