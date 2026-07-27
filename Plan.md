
# MERN-First Plan — Standards-Compliant, Beginner-Executable

## Core idea

Build ONE Node.js backend (monolith) — but organize it internally **exactly like separate microservices** (separate folders, separate concerns, own models, own routes). This gives you:

- Everything you already know (MERN) — no new infra to learn yet
- Zero loss of standards — same validation, auth, error handling, security as the "proper" microservices version
- A clean extraction path — later, each `/modules/*` folder can be lifted out into its own service almost as-is

**Rule for the whole build: every module is written as if it will one day run alone.** No module directly imports another module's database model — they only talk through defined functions/events. This one discipline is what makes the later split painless.

---

## Tech Stack (all MERN + 1 addition)

| Layer                | Tool                                       | Why                                                                                                                                                                                                      |
| -------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend             | React                                      | You already know it                                                                                                                                                                                      |
| Backend              | Node.js + Express                          | You already know it                                                                                                                                                                                      |
| Primary DB           | MongoDB                                    | You already know it — users, rooms, chat, meetings                                                                                                                                                      |
| Real-time            | Socket.io                                  | Signaling — sits inside the same Express server initially                                                                                                                                               |
| **New: Redis** | Redis                                      | Needed for: session/token blacklisting, room presence state, later Socket.io scaling. This is "the other DB" you mentioned — it's not replacing Mongo, it's a fast key-value store working alongside it |
| Media                | WebRTC (browser) + mediasoup (added later) | Real audio/video                                                                                                                                                                                         |
| TURN/STUN            | coturn                                     | NAT traversal                                                                                                                                                                                            |

**Why Redis specifically, not another DB:** Mongo is great for structured/persistent data (users, meetings, chat history). But things like "who is online right now," "who is currently in room X," or "block this token until it expires" need to be **fast, temporary, and constantly overwritten** — that's exactly what Redis is built for. Using Mongo for this would work but be slower and messier (you'd be manually expiring documents).

---

## Standards We Do NOT Drop (even in the simple version)

- ✅ Password hashing with bcrypt — never plaintext, ever
- ✅ JWT access + refresh token pattern — not just one long-lived token
- ✅ Input validation on every route (Joi or Zod) — never trust client input
- ✅ Centralized error-handling middleware — no scattered try/catch chaos
- ✅ Environment config via `.env` — no hardcoded secrets/URLs
- ✅ `helmet` + `cors` + rate limiting — basic security headers from day one
- ✅ Consistent API response shape (`{ success, data, error }`) across all routes
- ✅ Logging (`winston` or `pino`) — not just `console.log`
- ✅ Git from commit #1, `.env` in `.gitignore`
- ✅ Meaningful folder-per-module structure (below) — not one giant `server.js`

None of this is "extra" — it's the same standard a microservices version would have. You're just running it as one process instead of eight.

---

## Folder Structure (module-per-service, single server)

```
/backend
  /modules
    /auth          → signup, login, JWT, refresh tokens
    /users         → profile, preferences
    /rooms         → create meeting, room links, permissions
    /signaling     → Socket.io handlers (offer/answer/ICE relay)
    /chat          → in-call + persistent chat
  /common
    /middleware    → errorHandler, authGuard, validate
    /config        → db.js, redis.js, env.js
    /utils         → logger, response formatter
  server.js
```

Each folder under `/modules` has its own `routes.js`, `controller.js`, `model.js`, `service.js` — self-contained, like a mini service.

---

## Step-Wise Plan

### **Phase 0 — Project Setup (Day 1)**

- Init Express app, connect MongoDB, connect Redis
- Set up `.env`, `helmet`, `cors`, `morgan`/`winston` logging
- Set up global error-handling middleware and response format
- Deliverable: `GET /health` returns `{ success: true }`, Mongo + Redis both connected

### **Phase 1 — Auth Module**

- `POST /auth/signup` — bcrypt hash password, save to Mongo
- `POST /auth/login` — verify password, issue JWT access token + refresh token
- `POST /auth/refresh` — issue new access token
- Middleware: `authGuard` to protect routes
- Validation: Joi schema for email/password on both routes
- Deliverable: Postman flow — signup → login → access a protected route

### **Phase 2 — Users Module**

- `GET /users/me`, `PATCH /users/me` — profile fetch/update
- Deliverable: logged-in user can view/edit their profile

### **Phase 3 — Rooms Module**

- `POST /rooms` — creates meeting, generates unique room ID (nanoid/uuid)
- `GET /rooms/:id` — fetch room info + permission check (host/guest)
- Mongo schema: `rooms` (host, participants, createdAt, settings)
- Deliverable: authenticated user creates a room, gets a shareable link like `/join/:roomId`

### **Phase 4 — Signaling Module (Socket.io, same server)**

- Socket.io attached to the same Express HTTP server
- Auth: verify JWT on socket handshake
- Events: `join-room`, `offer`, `answer`, `ice-candidate`, `leave-room`
- Store "who's in which room" in **Redis** (not memory) — this is what makes scaling possible later without a rewrite
- Deliverable: two browser tabs, joined to the same room ID, exchange offer/answer and connect via WebRTC (mesh, 1:1 first)

### **Phase 5 — React Frontend: WebRTC Integration**

- `getUserMedia()` for camera/mic
- `RTCPeerConnection` setup, wire to Socket.io signaling events
- Basic UI: video tiles, mute/camera toggle
- Deliverable: real working 1:1 video call in the browser

### **Phase 6 — STUN/TURN**

- Add free STUN (Google's public STUN, or self-hosted coturn)
- Self-host coturn for TURN fallback
- Backend: generate short-lived TURN credentials (HMAC, tied to your JWT auth)
- Deliverable: call works across real-world networks, not just localhost/same-WiFi

### **Phase 7 — Chat Module**

- Socket.io event: `chat-message`, broadcast to room
- Persist messages in Mongo (`chats` collection, tied to `roomId`)
- Deliverable: chat sidebar during calls, messages saved and retrievable

### **Phase 8 — Group Calls (mesh → prepare for SFU)**

- Extend signaling to support 3-4 participants via mesh (each peer connects to each peer)
- **At this point you'll feel the mesh limitation yourself** — this is intentional; it's the natural trigger to introduce mediasoup later
- Deliverable: working 3-4 person calls, with awareness of the bandwidth ceiling

### **Phase 9 — Redis-Backed Scaling (optional, once you deploy for real users)**

- Add Socket.io Redis adapter so you can run more than one server instance
- Deliverable: kill one server instance mid-call, connections rebalance without full app failure

### **Phase 10 — Deployment**

- Single VM/droplet to start (DigitalOcean, Render, Railway) — no Kubernetes yet
- Docker Compose: `app`, `mongo`, `redis`, `coturn` as containers
- HTTPS via Let's Encrypt/Caddy (WebRTC requires secure origin)
- Deliverable: real domain, real HTTPS, shareable meeting links working from anywhere

---

## When (and only when) to move to microservices

Split a module out of the monolith **only when you hit one of these concrete triggers**, not preemptively:

| Trigger                                                  | What to split out                                    |
| -------------------------------------------------------- | ---------------------------------------------------- |
| Signaling server needs independent scaling from REST API | Signaling → own service                             |
| Adding mediasoup (SFU) for larger group calls            | SFU → own service (it's CPU-heavy, always separate) |
| Recording/notifications start blocking other requests    | Recording/Notifications → own async workers         |
| Auth needs to be reused by other future products         | Auth → own service                                  |

Because you built each module with its own model/controller/service and no cross-module DB access, each of these extractions is a **copy-the-folder-out** operation, not a rewrite.

---

## Immediate Next Step

Start with **Phase 0 + Phase 1 (setup + Auth module)** — this is the concrete, codeable starting point. Ready for me to generate the actual file structure and code for these two phases?
