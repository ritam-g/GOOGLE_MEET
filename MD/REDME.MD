
# Google Meet Clone — Microservices Architecture & Build Plan

## 1. Service Breakdown (What each microservice does)

| Service                                   | Responsibility                                                                 | Tech Stack                                | Communication               |
| ----------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------- | --------------------------- |
| **API Gateway**                     | Single entry point, routing, rate limiting, auth check                         | Node.js (Express/Fastify) or Kong/Nginx   | REST → internal services   |
| **Auth Service**                    | Signup/login, JWT issuance, refresh tokens, OAuth                              | Node.js + Postgres                        | REST + gRPC (internal)      |
| **User Service**                    | Profile, contacts, preferences                                                 | Node.js + Postgres                        | REST/gRPC                   |
| **Room/Meeting Service**            | Create meeting, generate room ID/link, schedule, participant list, permissions | Node.js + Postgres/Mongo                  | REST + async events         |
| **Signaling Service**               | WebSocket hub: join/leave, SDP offer/answer relay, ICE candidate relay         | Node.js + Socket.io + Redis adapter       | WebSocket (WSS)             |
| **SFU Media Service**               | Actual audio/video routing between participants                                | mediasoup (Node.js)                       | WebRTC (UDP) + internal API |
| **TURN/STUN Service**               | NAT traversal, relay fallback                                                  | coturn                                    | UDP/TCP                     |
| **Chat Service**                    | In-call and persistent text chat                                               | Node.js + Mongo                           | WebSocket + REST            |
| **Recording Service**               | Record/export meetings                                                         | Node.js worker + FFmpeg + S3/Blob storage | Async (queue-triggered)     |
| **Notification Service**            | Email/push invites, reminders                                                  | Node.js + Redis Queue/Kafka               | Async                       |
| **Presence Service** *(optional)* | Online/offline/in-call status                                                  | Node.js + Redis                           | Pub/Sub                     |

**Shared infra (not "services" but required):**

- **Redis** — Socket.io adapter (cross-instance signaling), presence, caching, TURN credential TTL
- **Message Broker** — Kafka or RabbitMQ, for async events (recording jobs, notifications, analytics)
- **API Gateway** — routes `/auth/*`, `/rooms/*`, `/users/*` to respective services; WebSocket traffic routed separately to Signaling Service
- **Service Discovery** — Kubernetes DNS (if on k8s) or Consul
- **Centralized Config/Secrets** — Vault or k8s Secrets

### Why microservices fit this app well

- Signaling (WebSocket, stateful, needs Redis) has completely different scaling behavior than Auth/User (stateless REST).
- SFU media servers are CPU/bandwidth-heavy and need independent scaling — you don't want to scale your Auth service just because call volume spikes.
- Recording is a background job — should never block real-time paths.
- Each can be deployed, scaled, and restarted independently without taking down live calls.

---

## 2. Step-Wise Build Plan

### **Phase 0 — Planning & Skeleton**

- Define service boundaries (table above)
- Choose monorepo (Nx/Turborepo) vs polyrepo — monorepo is easier solo
- Set up Docker + docker-compose for local multi-service dev
- Set up shared libraries (types, error handling, logging format) as an internal npm package

### **Phase 1 — Auth Service**

- JWT-based auth (access + refresh tokens)
- Signup/login/logout endpoints
- Postgres schema: users, sessions
- Deliverable: Postman-testable auth API

### **Phase 2 — User Service**

- Profile CRUD, avatar, display name
- Deliverable: authenticated user can fetch/update profile

### **Phase 3 — Room/Meeting Service**

- Create meeting → generates unique room ID/link
- Join permission logic (public link vs invite-only vs waiting room)
- Participant roles (host, co-host, guest)
- Postgres/Mongo schema: meetings, participants, invites
- Deliverable: create a room via API, get shareable link

### **Phase 4 — Signaling Service (core real-time piece)**

- Socket.io server, JWT-authenticated socket connections
- Events: `join-room`, `offer`, `answer`, `ice-candidate`, `leave-room`, `peer-disconnected`
- In-memory room state first (single instance)
- Deliverable: two browser tabs complete a 1:1 P2P WebRTC call (mesh, no SFU yet)

### **Phase 5 — STUN/TURN Integration**

- Deploy coturn (Docker container, public IP, open UDP ports)
- Backend endpoint to issue short-lived TURN credentials (HMAC-based)
- Deliverable: calls succeed across restrictive NAT/mobile networks, not just localhost

### **Phase 6 — Scale Signaling Horizontally**

- Add Redis adapter to Socket.io
- Move room state from in-memory to Redis
- Load balancer with sticky sessions (or rely on Redis pub/sub instead)
- Deliverable: run 2+ signaling service instances, calls still work across instances

### **Phase 7 — SFU Media Service (mediasoup)**

- Deploy mediasoup as its own service
- Concepts to implement: Router (per room), Producer (outgoing stream), Consumer (incoming stream), Transport
- Signaling Service talks to mediasoup's Node API to create/manage these
- Replace mesh connections with SFU-routed connections
- Deliverable: 5+ participants in one call without each client uploading 5 separate streams

### **Phase 8 — Chat Service**

- In-call chat over WebSocket (can reuse Signaling Service or split out)
- Persist chat history in Mongo, tied to meeting ID
- Deliverable: chat sidebar during calls, retrievable after meeting ends

### **Phase 9 — Recording Service**

- Trigger via message queue (host clicks "record")
- Worker pulls SFU stream (mediasoup supports "PlainTransport" for this), encodes with FFmpeg
- Upload to S3/Blob storage, store metadata in DB
- Deliverable: downloadable recording after a call

### **Phase 10 — Notification Service**

- Email invites, meeting reminders (via queue-triggered jobs)
- Deliverable: user gets email when invited to a scheduled meeting

### **Phase 11 — API Gateway Hardening**

- Rate limiting, request validation, centralized auth middleware
- Route WebSocket upgrade requests correctly to Signaling Service
- Deliverable: single entry point (e.g. `api.yourapp.com`) for all clients

### **Phase 12 — Observability**

- Centralized logging (ELK stack or Loki)
- Metrics (Prometheus + Grafana) — track active calls, SFU CPU/bandwidth, socket connections
- Distributed tracing (Jaeger/OpenTelemetry) across services
- Deliverable: dashboard showing live call count, error rates, SFU load

### **Phase 13 — CI/CD**

- Per-service Dockerfiles
- GitHub Actions/GitLab CI: build, test, push image per service on merge
- Deliverable: push to main → auto-deploy to staging

### **Phase 14 — Kubernetes Deployment**

- Each microservice as its own Deployment + Service
- HPA (Horizontal Pod Autoscaler) for SFU and Signaling based on CPU/connections
- Ingress for HTTP/WSS routing
- StatefulSet consideration for coturn (needs stable public IP)
- Deliverable: full stack running on k8s cluster (can start with a managed one — EKS/GKE/DigitalOcean)

### **Phase 15 — Load Testing & Security Hardening**

- Simulate concurrent calls (tools: Artillery for signaling, custom scripts for SFU load)
- HTTPS/WSS everywhere, CORS lockdown, input validation, TURN credential rotation
- Penetration test auth flows and room access control
- Deliverable: known capacity numbers (e.g. "500 concurrent 1:1 calls, 50 rooms of 10")

### **Phase 16 — Production Launch**

- Domain, TLS certs (Let's Encrypt/cert-manager)
- Region selection for latency (deploy SFU near your user base)
- Monitoring alerts (PagerDuty/Slack webhook on service down)
- Deliverable: live, monitored, production app

---

## 3. Suggested Order Priority (if time-boxed)

If you only have limited days, this is the minimum path to a genuinely working demo:

1. Phase 0–1 (skeleton + auth) — foundation
2. Phase 3–4 (rooms + signaling) — get a call working at all
3. Phase 5 (TURN) — make it actually work on real networks, not just localhost
4. Phase 7 (SFU) — this is the "production-grade" differentiator vs a toy demo
5. Phase 11–14 — only once the core works, wrap it for real deployment

Everything else (chat, recording, notifications) is additive and can come after the core call pipeline is solid.

---

## 4. Inter-Service Communication Pattern Summary

- **Sync (REST/gRPC):** Auth ↔ User ↔ Room services — request/response, need immediate answer
- **WebSocket (persistent):** Client ↔ Signaling Service, Client ↔ Chat Service
- **Async (queue/broker):** Room Service → Notification Service (on invite), Room Service → Recording Service (on record trigger)
- **Direct media (not through your backend at all):** Client ↔ SFU (mediasoup) over WebRTC/UDP — your backend only sets this up via signaling, then gets out of the way
