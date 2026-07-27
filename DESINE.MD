
# System Design — Video Meeting App (Microservices)

> Reference architecture document. Everything downstream (folder structure, actual code) maps directly to this design.

---

## Table of Contents

1. [High-Level Architecture](#1-high-level-architecture)
2. [Database-per-Service Ownership](#2-database-per-service-ownership)
3. [Flow 1 — Signup → Login](#3-flow-1--signup--login)
4. [Flow 2 — Create Room &amp; Join](#4-flow-2--create-room--join)
5. [Flow 3 — Call Setup (Core Real-Time Flow)](#5-flow-3--call-setup-core-real-time-flow)
6. [Flow 4 — Group Calls (SFU, Phase 9+)](#6-flow-4--group-calls-sfu-phase-9)
7. [API Contracts (REST)](#7-api-contracts-rest)
8. [Socket.io Event Contracts](#8-socketio-event-contracts)
9. [Data Models](#9-data-models)
10. [Security Boundaries](#10-security-boundaries)
11. [Scaling Points](#11-scaling-points)
12. [Next Steps](#12-next-steps)

---

## 1. High-Level Architecture

Two planes are **always kept separate**:

- **Control plane** — REST + WebSocket signaling. Small JSON messages. Goes through your services.
- **Media plane** — actual audio/video. UDP/SRTP. Goes browser-to-browser or browser-to-SFU **directly** — never touches Mongo, Redis, or business logic.

```mermaid
flowchart TB
    Browser["🖥️ Browser (React)"]

    subgraph ControlPlane["CONTROL PLANE"]
        Gateway["API Gateway<br/>:4000"]
        Signaling["Signaling Service<br/>:4004"]

        Auth["Auth Service<br/>:4001"]
        User["User Service<br/>:4002"]
        Room["Room Service<br/>:4003"]
        Chat["Chat Service<br/>:4005"]
        SFU["SFU Service (mediasoup)<br/>:4006<br/><i>added Phase 9</i>"]

        AuthDB[("auth_db<br/>Mongo")]
        UserDB[("user_db<br/>Mongo")]
        RoomDB[("room_db<br/>Mongo")]
        ChatDB[("chat_db<br/>Mongo")]
        Redis[("Redis<br/>pub/sub, presence")]
    end

    Coturn["COTURN<br/>STUN/TURN"]

    Browser -- "REST: auth / rooms / users" --> Gateway
    Browser -- "WebSocket (direct)" --> Signaling

    Gateway --> Auth
    Gateway --> User
    Gateway --> Room
    Gateway --> Chat

    Auth --> AuthDB
    User --> UserDB
    Room --> RoomDB
    Chat --> ChatDB

    Signaling -. "internal API" .-> SFU
    Signaling --- Redis
    Signaling -.-> Coturn

    Browser <-. "P2P mesh OR via SFU<br/>UDP/SRTP — NEVER through<br/>any backend service above" .-> Browser

    style ControlPlane fill:#eef3ff,stroke:#5b7fff
    style Browser fill:#fff4e0,stroke:#d99a2b
    style Coturn fill:#ffe8e8,stroke:#d94a4a
```

**The one deliberate exception:** the browser connects to the **Signaling Service** directly over WebSocket, bypassing the API Gateway.

---

## 2. Database-per-Service Ownership

Each service owns its data exclusively. No service reaches into another service's database — they always go through that service's API.

```mermaid
flowchart LR
    Auth["Auth Service"] --> AuthDB[("auth_db<br/>users, password hashes,<br/>refresh tokens")]
    User["User Service"] --> UserDB[("user_db<br/>profiles, preferences")]
    Room["Room Service"] --> RoomDB[("room_db<br/>meetings, participants,<br/>permissions")]
    Chat["Chat Service"] --> ChatDB[("chat_db<br/>messages")]
    Signaling["Signaling Service"] --> RedisPresence[("Redis<br/>ephemeral presence only<br/>— no DB")]
```

| Service           | Owns DB                                                             | Never accessed by                                   |
| ----------------- | ------------------------------------------------------------------- | --------------------------------------------------- |
| Auth Service      | `auth_db` (users, password hashes, refresh tokens)                | Every other service — they call Auth's API instead |
| User Service      | `user_db` (profiles, preferences)                                 | Auth, Room, Chat                                    |
| Room Service      | `room_db` (meetings, participants, permissions)                   | Others — they call Room's API                      |
| Chat Service      | `chat_db` (messages)                                              | Others                                              |
| Signaling Service | No DB — uses**Redis** for ephemeral room-presence state only | —                                                  |

> Cross-service links are stored as **plain IDs** (e.g. Room Service stores `hostId: "abc123"` as a plain string, not a real Mongo reference — because it points to a document in a *different* database).

---

## 3. Flow 1 — Signup → Login

```mermaid
sequenceDiagram
    autonumber
    participant B as Browser
    participant G as API Gateway
    participant A as Auth Service
    participant AD as auth_db
    participant R as Redis
    participant U as User Service
    participant UD as user_db

    rect rgb(240, 248, 255)
    Note over B,UD: SIGNUP
    B->>G: POST /api/auth/signup { email, password }
    G->>A: forward request
    A->>A: validate input, bcrypt hash password
    A->>AD: save new user document
    A->>R: publish "user-created" event
    R-->>U: event delivered (subscribed)
    U->>UD: create empty profile
    A->>G: { success: true, userId }
    G->>B: { success: true, userId }
    end

    rect rgb(255, 248, 240)
    Note over B,AD: LOGIN
    B->>G: POST /api/auth/login { email, password }
    G->>A: forward request
    A->>AD: fetch user, verify bcrypt hash
    A->>A: issue JWT access token (~15min)<br/>+ refresh token (long-lived)
    A->>AD: store refresh token
    A->>G: { accessToken, refreshToken }
    G->>B: { accessToken, refreshToken }
    end
```

---

## 4. Flow 2 — Create Room & Join

```mermaid
sequenceDiagram
    autonumber
    participant B as Browser (host)
    participant BJ as Browser (joiner)
    participant G as API Gateway
    participant RM as Room Service
    participant A as Auth Service
    participant RD as room_db

    Note over B,RD: CREATE ROOM
    B->>G: POST /api/rooms<br/>Authorization: Bearer accessToken
    G->>RM: forward request
    RM->>A: GET /internal/verify-token
    A->>RM: { valid: true, userId }
    RM->>RD: create room doc { roomId, hostId, createdAt }
    RM->>G: { roomId, joinLink }
    G->>B: { roomId, joinLink }

    Note over BJ,RD: JOIN ROOM
    BJ->>G: GET /api/rooms/:roomId
    G->>RM: forward request
    RM->>RD: check permissions (public / invite-only)
    RM->>G: { roomId, allowed: true }
    G->>BJ: { roomId, allowed: true }
```

---

## 5. Flow 3 — Call Setup (Core Real-Time Flow)

Both browsers connect **directly** to the Signaling Service via WebSocket — this bypasses the API Gateway entirely (the one deliberate exception noted in §1).

```mermaid
sequenceDiagram
    autonumber
    participant A as Browser A
    participant S as Signaling Service
    participant Auth as Auth Service
    participant R as Redis
    participant B as Browser B

    A->>S: socket.connect(token=accessToken)
    S->>Auth: verify token (/internal/verify-token)
    Auth->>S: valid
    A->>S: emit "join-room" { roomId }
    S->>R: add A to room-presence set

    B->>S: socket.connect(token=accessToken)
    S->>Auth: verify token
    Auth->>S: valid
    B->>S: emit "join-room" { roomId }
    S->>R: add B to room-presence set
    S->>A: emit "peer-joined" { peerId: B }

    Note over A,B: SDP / ICE negotiation (control plane — small JSON only)
    A->>A: create RTCPeerConnection, generate SDP offer
    A->>S: emit "offer" { to: B, sdp }
    S->>B: relay "offer" { from: A, sdp }

    B->>B: set remote description, generate SDP answer
    B->>S: emit "answer" { to: A, sdp }
    S->>A: relay "answer" { from: B, sdp }

    A->>S: emit "ice-candidate" (repeated)
    S->>B: relay "ice-candidate"
    B->>S: emit "ice-candidate" (repeated)
    S->>A: relay "ice-candidate"

    Note over A,B: ICE negotiation completes
    rect rgb(255, 235, 235)
    A->>B: 🎥 Direct media path (P2P or via TURN)<br/>UDP/SRTP — Signaling Service NOT involved
    end
```

**Key point:** steps 1–11 are small JSON control-plane messages. The final media exchange completely bypasses the backend.

---

## 6. Flow 4 — Group Calls (SFU, Phase 9+)

Instead of a full mesh (Browser A connecting directly to B, C, D), every browser connects to **one SFU** instead.

```mermaid
flowchart TB
    subgraph Mesh["❌ Mesh (N-1 uploads per browser — doesn't scale)"]
        direction LR
        MA["Browser A"] <---> MB["Browser B"]
        MA <---> MC["Browser C"]
        MB <---> MC
    end

    subgraph SFUModel["✅ SFU Model (1 upload per browser)"]
        direction TB
        SA["Browser A"] -- "produce" --> SFU["SFU Service<br/>(mediasoup)"]
        SB["Browser B"] -- "produce" --> SFU
        SC["Browser C"] -- "produce" --> SFU
        SFU -- "consume" --> SA
        SFU -- "consume" --> SB
        SFU -- "consume" --> SC
    end

    Signaling["Signaling Service"] -. "coordinates via internal API:<br/>create producers/consumers" .-> SFU

    style Mesh fill:#ffe8e8,stroke:#d94a4a
    style SFUModel fill:#e8ffe8,stroke:#3fae3f
```

**Sequence:**

```mermaid
sequenceDiagram
    autonumber
    participant A as Browser A
    participant S as Signaling Service
    participant SFU as SFU Service (mediasoup)
    participant B as Browser B
    participant C as Browser C

    A->>SFU: create ONE RTCPeerConnection to SFU (not to peers)
    A->>SFU: produce stream
    S->>SFU: internal API: create consumer for B, C
    SFU->>B: forward A's stream
    SFU->>C: forward A's stream

    Note over A,C: Same pattern repeats for B's stream and C's stream
    Note over A,C: Each browser uploads ONCE instead of N-1 times — the entire reason SFU exists
```

---

## 7. API Contracts (REST)

All requests go through the **API Gateway**, except the one WebSocket exception noted above.

```mermaid
flowchart LR
    G["API Gateway :4000"]
    G -->|"POST /api/auth/signup<br/>(no auth)"| Auth1["Auth Service"]
    G -->|"POST /api/auth/login<br/>(no auth)"| Auth2["Auth Service"]
    G -->|"POST /api/auth/refresh<br/>(refresh token)"| Auth3["Auth Service"]
    G -->|"GET/PATCH /api/users/me<br/>(JWT)"| User["User Service"]
    G -->|"POST /api/rooms<br/>(JWT)"| Room1["Room Service"]
    G -->|"GET /api/rooms/:id<br/>(JWT)"| Room2["Room Service"]
    G -->|"GET /api/chat/:roomId<br/>(JWT)"| Chat["Chat Service"]

    Room1 -.->|"GET /internal/verify-token<br/>(service-to-service only)"| Auth4["Auth Service"]
```

| Method | Endpoint                   | Service | Auth Required                                           |
| ------ | -------------------------- | ------- | ------------------------------------------------------- |
| POST   | `/api/auth/signup`       | Auth    | No                                                      |
| POST   | `/api/auth/login`        | Auth    | No                                                      |
| POST   | `/api/auth/refresh`      | Auth    | Refresh token                                           |
| GET    | `/api/users/me`          | User    | Yes                                                     |
| PATCH  | `/api/users/me`          | User    | Yes                                                     |
| POST   | `/api/rooms`             | Room    | Yes                                                     |
| GET    | `/api/rooms/:id`         | Room    | Yes                                                     |
| GET    | `/api/chat/:roomId`      | Chat    | Yes                                                     |
| GET    | `/internal/verify-token` | Auth    | Service-to-service (internal only, not gateway-exposed) |

> **Internal-only endpoints** like `/internal/verify-token` are not reachable from the public gateway — restricted via Docker network isolation (services on an internal Docker network; only the gateway is exposed publicly).

---

## 8. Socket.io Event Contracts

Signaling Service handles these events over the direct WebSocket connection:

```mermaid
flowchart LR
    subgraph ClientToServer["Client → Server"]
        direction TB
        E1["join-room<br/>{ roomId }"]
        E2["offer<br/>{ to, sdp }"]
        E3["answer<br/>{ to, sdp }"]
        E4["ice-candidate<br/>{ to, candidate }"]
        E5["leave-room<br/>{ roomId }"]
        E6["chat-message<br/>{ roomId, text }"]
    end

    subgraph ServerToClient["Server → Client"]
        direction TB
        R1["peer-joined<br/>{ peerId }"]
        R2["offer<br/>{ from, sdp }"]
        R3["answer<br/>{ from, sdp }"]
        R4["ice-candidate<br/>{ from, candidate }"]
        R5["peer-left<br/>{ peerId }"]
        R6["chat-message<br/>{ from, text, timestamp }"]
    end

    E1 -.-> R1
    E2 -.-> R2
    E3 -.-> R3
    E4 -.-> R4
    E5 -.-> R5
    E6 -.-> R6

    style ClientToServer fill:#eef3ff,stroke:#5b7fff
    style ServerToClient fill:#fff4e0,stroke:#d99a2b
```

| Event (client → server) | Payload               | Event (server → client) | Payload                       |
| ------------------------ | --------------------- | ------------------------ | ----------------------------- |
| `join-room`            | `{ roomId }`        | `peer-joined`          | `{ peerId }`                |
| `offer`                | `{ to, sdp }`       | `offer`                | `{ from, sdp }`             |
| `answer`               | `{ to, sdp }`       | `answer`               | `{ from, sdp }`             |
| `ice-candidate`        | `{ to, candidate }` | `ice-candidate`        | `{ from, candidate }`       |
| `leave-room`           | `{ roomId }`        | `peer-left`            | `{ peerId }`                |
| `chat-message`         | `{ roomId, text }`  | `chat-message`         | `{ from, text, timestamp }` |

---

## 9. Data Models

Entity-relationship view across services. Note the **dashed lines** — these are *not* real foreign keys, just plain string IDs referencing documents in a different database.

```mermaid
erDiagram
    AUTH_USERS {
        string _id PK
        string email
        string passwordHash
        array refreshTokens
        date createdAt
    }
    USER_PROFILES {
        string _id PK
        string userId "matches auth_db._id (plain string, not a real ref)"
        string displayName
        string avatarUrl
        object preferences
    }
    ROOMS {
        string _id PK
        string roomId "short unique code"
        string hostId "plain string, not a real ref"
        array participants "array of userId strings"
        string visibility
        date createdAt
    }
    CHAT_MESSAGES {
        string _id PK
        string roomId
        string senderId "plain string, not a real ref"
        string text
        date timestamp
    }

    AUTH_USERS ||--o| USER_PROFILES : "userId (cross-db, string only)"
    AUTH_USERS ||--o{ ROOMS : "hostId (cross-db, string only)"
    ROOMS ||--o{ CHAT_MESSAGES : "roomId (cross-db, string only)"
    AUTH_USERS ||--o{ CHAT_MESSAGES : "senderId (cross-db, string only)"
```

**Redis keys (Signaling Service — no persistent DB):**

```
room:{roomId}:members   → Set of socketIds/userIds currently in the room
token:blacklist:{token} → for logout/revoked token checks
```

---

## 10. Security Boundaries

```mermaid
flowchart TB
    Internet["🌐 Public Internet"]

    subgraph Public["Exposed publicly"]
        Gateway["API Gateway"]
        Signaling["Signaling Service"]
    end

    subgraph Internal["Internal Docker network — unreachable from outside"]
        Auth["Auth Service"]
        User["User Service"]
        Room["Room Service"]
        Chat["Chat Service"]
        SFU["SFU Service"]
    end

    Internet -->|HTTPS| Gateway
    Internet -->|WSS| Signaling
    Gateway -->|"internal, secret-header auth"| Internal
    Signaling -->|"internal, secret-header auth"| Internal

    style Public fill:#e8ffe8,stroke:#3fae3f
    style Internal fill:#ffe8e8,stroke:#d94a4a
    style Internet fill:#eef3ff,stroke:#5b7fff
```

- Only **API Gateway** and **Signaling Service** are exposed to the public internet; every other service sits on an internal Docker network, unreachable directly.
- `/internal/*` routes require a shared **internal service-secret header**, not user JWTs.
- **TURN credentials** are short-lived (HMAC-signed, expire in minutes) — issued by Auth Service, never static.
- **Rate limiting** at the Gateway (per-IP and per-user) to prevent signup/login abuse.
- All service-to-service and client-to-service traffic runs over **HTTPS/WSS**, even internally in production.

---

## 11. Scaling Points

Where bottlenecks will actually appear, and how each component scales:

```mermaid
flowchart TB
    A["API Gateway / Auth / User / Room / Chat<br/><i>scales by: request volume</i>"] -->|"Horizontal —<br/>stateless, add containers"| A1["✅"]
    B["Signaling Service<br/><i>scales by: concurrent socket connections</i>"] -->|"Horizontal +<br/>Redis adapter for<br/>cross-instance room state"| B1["✅"]
    C["SFU Service<br/><i>scales by: bandwidth + CPU</i>"] -->|"Vertical (bigger machines) +<br/>horizontal by room-sharding<br/>(each room pinned to one SFU node)"| C1["✅"]
    D["Mongo (per service)<br/><i>scales by: read/write volume</i>"] -->|"Replica sets per<br/>service DB as needed"| D1["✅"]
    E["Redis<br/><i>scales by: pub/sub + presence load</i>"] -->|"Redis Cluster if it<br/>becomes a bottleneck<br/>(rare until real scale)"| E1["✅"]
```

| Component                               | Scales by                       | How                                                                                         |
| --------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------- |
| API Gateway / Auth / User / Room / Chat | Request volume                  | Horizontal — stateless, add more containers                                                |
| Signaling Service                       | Concurrent socket connections   | Horizontal + Redis adapter for cross-instance room state                                    |
| SFU Service                             | Bandwidth + CPU (media routing) | Vertical (bigger machines) + horizontal by room-sharding (each room pinned to one SFU node) |
| Mongo (per service)                     | Read/write volume               | Replica sets per service DB as needed                                                       |
| Redis                                   | Pub/sub + presence load         | Redis Cluster if it becomes a bottleneck (rare until real scale)                            |

---

## 12. Next Steps

This is the reference design — everything downstream (folder structure, actual code) maps directly to this blueprint.

**Ready to start Phase 0 + Phase 1** (skeleton + API Gateway) in actual code, using this design as the reference.
