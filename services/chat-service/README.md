# Chat Service

**Port:** 4005
**Database:** MongoDB (chat_db)

## What this service does
- Stores and serves persistent in-call text chat messages
- Listens to Redis for "chat-message" events published by Signaling Service
- Exposes GET /:roomId to fetch chat history for a room
- Kept separate from Signaling so a chat bug can never break a live call

## Talks to
- Redis (subscribes to chat-message event)
