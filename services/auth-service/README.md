# Auth Service

**Port:** 4001
**Database:** PostgreSQL (auth_db)

## What this service does
- Owns signup, login, JWT access + refresh tokens
- Hashes passwords with bcrypt — the ONLY service that ever sees a raw password
- Exposes /internal/verify-token so other services can check if a token is valid
- Publishes a "user-created" event to Redis on signup, so User Service can react

## Talks to
- Redis (publishes user-created event)
- Called internally by: room-service, signaling-service (token verification)
