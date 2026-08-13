# User Service

**Port:** 4002
**Database:** PostgreSQL (user_db)

## What this service does
- Owns user profile data: display name, avatar, preferences
- Never touches passwords or login logic — that is Auth's job only
- Listens to Redis for the "user-created" event and auto-creates a blank profile
- Exposes GET/PATCH /me for the logged-in user's own profile

## Talks to
- Redis (subscribes to user-created event)
