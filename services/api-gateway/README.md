# API Gateway

**Port:** 4000
**Database:** None

## What this service does
- Single public entry point for the browser — the only REST address the frontend talks to
- Forwards (proxies) requests to the correct internal service based on URL path:
  - /api/auth/*  -> auth-service
  - /api/users/* -> user-service
  - /api/rooms/* -> room-service
  - /api/chat/*  -> chat-service
- Applies security middleware here first: helmet, cors, rate limiting
- Does NOT contain business logic — it only routes traffic

## Talks to
- auth-service, user-service, room-service, chat-service (via REST)
