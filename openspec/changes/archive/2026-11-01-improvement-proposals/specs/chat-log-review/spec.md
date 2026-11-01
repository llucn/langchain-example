## MODIFIED Requirements

### Requirement: Good/Bad review of sessions and messages
An admin SHALL be able to rate a session as a whole and each message event except `user_input` events as Good or Bad with the Good and Bad buttons (user input events are shown without rating buttons), optionally adding a comment and tags from a fixed list: `wrong_routing`, `wrong_tool`, `bad_tool_args`, `hallucination`, `incomplete`, `wrong_language`, `tone`, `too_verbose`, `stop_condition` (the agent kept asking or continuing when it should have finished), `missing_capability` (the agent lacks a tool or permission it needs) and `other`. Each admin has at most one review per target; rating again changes it, and an admin can remove their review. Reviews SHALL be stored apart from the log records and record the reviewer, reviewer type (`human`) and time.

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

#### Scenario: New tags
- **WHEN** the admin tags a Bad review `stop_condition` or `missing_capability`
- **THEN** the review is saved with those tags and the page shows them

#### Scenario: Unknown tag
- **WHEN** a request contains a tag that is not in the list
- **THEN** the system responds 400

### Requirement: Expected result
On a message review an admin SHALL be able to record the expected result (what the agent should have said or done, e.g. the expected tool call or answer) next to the comment. The `difference` attribute SHALL NOT be part of the review data structure (shared types, entity, API request and response); the `difference` column of `chat_log_reviews` is kept in the database unused and unmapped. The expected result SHALL be rejected on session-level reviews.

#### Scenario: Annotate an answer
- **WHEN** the admin rates an `llm_end_turn` event Bad and fills in comment and expected result
- **THEN** both texts are stored with the review and shown with the event

#### Scenario: Session review with expected result
- **WHEN** a session-level review includes an expected result
- **THEN** the system rejects it with 400

#### Scenario: No difference attribute
- **WHEN** a review is read through the API
- **THEN** the response has no `difference` property
