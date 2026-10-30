## ADDED Requirements

### Requirement: Admin role from the token
The system SHALL treat a user as admin when the `cognito:groups` claim of the validated token contains the group named by `ADMIN_GROUP` (default `admin`).

#### Scenario: Admin user
- **WHEN** a token's groups include `admin`
- **THEN** the user is admin

#### Scenario: Custom group name
- **WHEN** `ADMIN_GROUP` is `ops` and the token's groups include `ops` but not `admin`
- **THEN** the user is admin

### Requirement: Admin-only API
Endpoints marked admin-only SHALL respond 403 to authenticated users who are not admin and 401 to unauthenticated requests. When authentication is disabled, admin-only endpoints SHALL be open, as all other endpoints are.

#### Scenario: Non-admin call
- **WHEN** a user without the admin group calls an admin-only endpoint
- **THEN** the system responds 403

#### Scenario: Authentication disabled
- **WHEN** `AUTH_ENABLED=false` and an admin-only endpoint is called
- **THEN** the request is served

### Requirement: Admin-only navigation
The web app SHALL show admin-only navigation items and routes only to admin users and SHALL show a not-authorised message when a non-admin opens an admin route directly.

#### Scenario: Non-admin navigation
- **WHEN** a non-admin user views the sidebar
- **THEN** the Log Review item is not shown

#### Scenario: Direct URL
- **WHEN** a non-admin opens the Log Review URL
- **THEN** a not-authorised message is shown and no log data is requested
