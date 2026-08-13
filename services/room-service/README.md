# Room Service

**Port:** 4003
**Database:** PostgreSQL (room_db)

## What this service does
- Creates meetings/rooms, generates unique room codes and join links
- Manages participants and their roles (host / co-host / guest)
- Enforces join permissions (public vs invite-only)
- Verifies the caller's JWT by calling Auth Service's /internal/verify-token
  (Room Service holds no login data of its own)

## Talks to
- auth-service (REST, verify-token)
