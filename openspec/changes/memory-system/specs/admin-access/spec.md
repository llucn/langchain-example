## ADDED Requirements

### Requirement: Admin access to all users' memories
The memory endpoints under `/api/admin/memories` SHALL be admin-only, and the **Memory** page SHALL show every user's memories, an email column and an email filter to admins only (see `user-memory`).

#### Scenario: Admin
- **WHEN** a user whose token groups include the admin group opens Memory
- **THEN** the memories of all users and the email filter are shown

#### Scenario: Non-admin
- **WHEN** a non-admin calls `/api/admin/memories`
- **THEN** the system responds 403, and 401 when unauthenticated
