
# True Microservices Plan — MERN Stack, Separate Services From Day 1

## What "true microservices" means concretely here

- Each service = **its own folder, own `package.json`, own `server.js`, own port, own Dockerfile**
- Each service can be started/stopped/deployed **independently**
- Services **never** import each other's code or directly touch each other's database
- Services talk **only** over the network — REST calls or events, never a shared in-process function call
- **Database-per-service** — each service owns its own Mongo database (not the whole Mongo instance, a *separate database* inside it — simplest way to enforce "no service touches another's data")

---

## Repo Structure (monorepo — one Git repo, many independently-runnable services)

```
/video-meet-app
  /services
    /api-gateway        → port 4000, entry point, routes to all others
    /auth-service        → port 4001, own Mongo DB "auth_db"
    /user-service         → port 4002, own Mongo DB "user_db"
    /room-service         → port 4003, own Mongo DB "room_db"
    /signaling-service    → port 4004, Socket.io, Redis (no Mongo needed)
    /chat-service          → port 4005, own Mongo DB "chat_db"
  /docker-compose.yml     → runs everything together with ONE command
  /shared                 → tiny shared package: error format, logger config (published as local npm package, NOT shared DB models)
```

Each service under `/services/*` looks like this internally:

```
/auth-service
  /src
    /routes
    /controllers
    /models
    /middleware
    /config
    server.js
  package.json
  Dockerfile
  .env
```

**Key rule:** `/shared` only contains truly generic, stateless utilities (logger format, error class, response formatter). It must NEVER contain a database model or business logic — the moment two services share a model, they're not really separate services anymore.

---

## Communication Pattern (kept simple for a beginner, still correct)

| Interaction                                               | Method                                                                                                     | Why                                                                                      |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Client → any service                                     | Through**API Gateway** only                                                                          | Client never calls services directly                                                     |
| Service → service (needs immediate answer)               | Plain REST call (`axios`/`fetch`)                                                                      | Simplest to understand and debug — gRPC/message queues can come later                   |
| Service → service (fire-and-forget, e.g. "user created") | Redis Pub/Sub                                                                                              | You're already adding Redis for signaling — reuse it instead of learning Kafka on day 1 |
| Client ↔ Signaling Service                               | Direct WebSocket (bypasses gateway for this one, since Socket.io + HTTP proxying gets messy for beginners) | Common real-world exception even in production systems                                   |

**Why not gRPC or Kafka from day 1:** They're the "more correct at scale" choice, but they add a second thing to learn (protobuf, broker ops) on top of microservices itself. REST + Redis pub/sub gets you 90% of the architectural benefit with tools you already understand.

---

## Step-Wise Build Order

### **Phase 0 — Infra Skeleton**

- Create the folder structure above
- `docker-compose.yml` with: `mongo`, `redis`, and placeholders for each service
- Each service gets a minimal `server.js` that just responds `{ status: "ok" }` on `/health`
- Deliverable: `docker-compose up` starts all empty services, each `/health` responds

### **Phase 1 — API Gateway**

- Express app that proxies requests: `/api/auth/*` → auth-service, `/api/users/*` → user-service, `/api/rooms/*` → room-service
- Use `http-proxy-middleware` (simplest option for a beginner — no need for Kong/Nginx yet)
- Deliverable: hitting `gateway:4000/api/auth/health` returns auth-service's response

### **Phase 2 — Auth Service**

- Own Mongo DB, own `User` model (only auth-service ever touches this — password hash, email)
- `POST /signup`, `POST /login`, `POST /refresh` — bcrypt + JWT
- Deliverable: through the gateway, signup → login → get JWT

### **Phase 3 — User Service**

- Own Mongo DB, own `Profile` model — **separate from Auth's User model**, linked only by `userId` (a plain string/ObjectId, not a foreign key relationship, since it's a different DB)
- When Auth Service creates a user, it publishes a `user-created` event (Redis pub/sub) → User Service listens and creates a matching profile
- **This is your first real inter-service event** — a good one to fully understand before moving on
- Deliverable: signup via Auth triggers a profile automatically appearing in User Service's DB

### **Phase 4 — Room Service**

- Own Mongo DB, own `Room` model
- Calls Auth Service's `/verify-token` endpoint (REST) to check the JWT on incoming requests, since Room Service has no user data of its own
- Deliverable: authenticated user (verified via a network call to Auth Service) creates a room

### **Phase 5 — Signaling Service**

- Socket.io server, standalone, port 4004
- Verifies JWT on socket handshake by calling Auth Service's `/verify-token`
- Room presence state stored in **Redis** (shared with other services if needed)
- Deliverable: two clients connect directly to Signaling Service (not through gateway) and exchange offer/answer/ICE

### **Phase 6 — React Frontend**

- Talks to API Gateway for REST (auth/rooms/users)
- Talks directly to Signaling Service for WebSocket
- WebRTC `RTCPeerConnection` wiring
- Deliverable: real 1:1 video call, all pieces connected

### **Phase 7 — TURN/STUN**

- coturn as its own container in docker-compose
- Auth Service (or a small dedicated endpoint) issues short-lived TURN credentials
- Deliverable: calls work across real networks

### **Phase 8 — Chat Service**

- Own Mongo DB, listens to Signaling Service's `chat-message` events via Redis pub/sub, persists them
- Deliverable: chat history survives page refresh, pulled from Chat Service via gateway

### **Phase 9 — Group Calls → SFU**

- Once mesh calls feel limited (3-4 people), introduce `sfu-service` (mediasoup) as its own service, same pattern as above
- Signaling Service talks to SFU Service over REST/internal API to manage producers/consumers

### **Phase 10 — Deployment**

- Each service already has its own Dockerfile — deploy each as its own container (Docker Compose on one VM to start, Kubernetes later if needed)
- Environment variables per service, not shared `.env`

---

## Standards Kept at Every Service (non-negotiable, same as before)

- ✅ bcrypt password hashing (Auth Service only — no other service ever sees raw passwords)
- ✅ JWT verified centrally (Auth Service is the single source of truth for "is this token valid")
- ✅ Input validation (Joi/Zod) inside every service, not just the gateway
- ✅ Own error-handling middleware per service (don't assume the gateway catches everything)
- ✅ Own `.env` per service — no shared secrets file
- ✅ Own logger per service, tagged with service name, so logs are traceable across services
- ✅ Consistent `{ success, data, error }` response shape across all services

---

## The First Real Microservices Lesson You'll Hit

In Phase 3 (User Service), you'll notice something monolith devs never deal with: **you can't just do a Mongo `.populate()` across services** because Auth's DB and User's DB are physically separate databases. This is intentional — it's the exact tradeoff of microservices (isolation) vs monolith (convenience). You'll solve it with either:

- An event (`user-created`) that copies just the needed fields over, or
- A live REST call when you need fresh data

This single problem — "how do services get data from each other without a shared DB" — is 80% of what makes microservices architecture feel different from what you're used to. Good to feel it early, in Phase 3, rather than discover it later.

---

## Immediate Next Step

Start with **Phase 0 (infra skeleton) + Phase 1 (API Gateway)** — this gives you the empty scaffold with all services talking to each other via the gateway, before any real logic exists. Ready for the actual code/files for these two phases?
