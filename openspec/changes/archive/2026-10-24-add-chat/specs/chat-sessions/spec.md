## ADDED Requirements

### Requirement: Sessions are persisted with a start time
The system SHALL store each chat session with a unique id, an optional owner, a name and a start timestamp.

#### Scenario: Create a session
- **WHEN** a client creates a chat session
- **THEN** the system stores it with the current time as its start time and no name

### Requirement: Session name is the first message
The system SHALL name a session after the first user message sent in it, with whitespace collapsed and truncated to 80 characters, and SHALL NOT change the name afterwards.

#### Scenario: First message names the session
- **WHEN** the first message "Elevator on admin building is stuck." is sent to an unnamed session
- **THEN** the session name becomes "Elevator on admin building is stuck."

#### Scenario: Later messages keep the name
- **WHEN** a further message is sent to a named session
- **THEN** the session name is unchanged

### Requirement: Session list
The system SHALL list chat sessions newest first, and the web app SHALL show each session's name and start time, showing "New chat" for unnamed sessions.

#### Scenario: Newest first
- **WHEN** a client lists sessions
- **THEN** sessions are returned ordered by start time descending

#### Scenario: Open a session from the list
- **WHEN** the user selects a session in the list
- **THEN** its messages are loaded into the conversation view

### Requirement: Sessions are scoped to the user
When authentication is enabled, the system SHALL only list and serve sessions owned by the token's subject, and SHALL respond 404 for any other session.

#### Scenario: Foreign session
- **WHEN** a user requests messages of a session owned by someone else
- **THEN** the system responds 404
