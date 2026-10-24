## MODIFIED Requirements

### Requirement: Session name is the first message
The system SHALL initially name a session after the first user message sent in it, with whitespace collapsed and truncated to 80 characters. The name SHALL NOT change on later messages, except when the AI agent renames the session through the `renameSession` tool.

#### Scenario: First message names the session
- **WHEN** the first message "Elevator on admin building is stuck." is sent to an unnamed session
- **THEN** the session name becomes "Elevator on admin building is stuck."

#### Scenario: Later messages keep the name
- **WHEN** a further message is sent to a named session and the agent does not rename it
- **THEN** the session name is unchanged

#### Scenario: Agent renames the session
- **WHEN** the agent calls `renameSession` while answering
- **THEN** the session name becomes the agent's title and the session list shows it

## ADDED Requirements

### Requirement: Delete a session
The system SHALL let a user delete a chat session through `DELETE /chat/sessions/:id`, responding 204, and SHALL delete the session's messages with it. The web app SHALL show a delete icon at the right of a session's name in the list while the pointer is over it, and SHALL ask for confirmation before deleting. A session that does not exist or belongs to another user SHALL give 404.

#### Scenario: Confirm deletion
- **WHEN** the user clicks the delete icon of a session and confirms
- **THEN** the session and all its messages are deleted and it disappears from the list

#### Scenario: Cancel deletion
- **WHEN** the user clicks the delete icon and cancels
- **THEN** nothing is deleted

#### Scenario: Delete the open session
- **WHEN** the user deletes the session currently shown
- **THEN** the view returns to a new, empty chat

#### Scenario: Foreign or missing session
- **WHEN** a client deletes a session that does not exist or belongs to someone else
- **THEN** the system responds 404 and deletes nothing
