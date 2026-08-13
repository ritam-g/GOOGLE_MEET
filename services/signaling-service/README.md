# Signaling Service

**Port:** 4004
**Database:** None (uses Redis only, for ephemeral room presence)

## What this service does
- Real-time WebSocket hub (Socket.io) — the "matchmaker" for calls
- Relays offer / answer / ice-candidate messages between browsers so they
  can connect directly to each other (WebRTC signaling)
- Verifies JWT on socket connection via Auth Service
- Tracks who is currently in which room using Redis (not memory, not a DB)
- This is the ONE service the browser connects to directly, bypassing the Gateway
- Talks to SFU Service internally once group calls (3+ people) are introduced

## Talks to
- auth-service (REST, verify-token)
- Redis (presence + pub/sub for chat-message events)
- sfu-service (internal API, added Phase 9)
