# Auth Service — Progress Tracker (v3)

> Phase 2 of the Video Meet App build. Branch: `phase-0-auth-service`. Core signup/login/refresh flow is built and tested. This version tracks what's left before calling Phase 2 fully complete.

---

## 1. Current Project Structure

```
auth-service/
├── prisma/
│   ├── migrations/
│   │   └── 20260815055056_init/
│   └── schema.prisma
├── generated/
│   └── prisma/              (auto-generated, gitignored)
├── src/
│   ├── config/
│   │   ├── db.ts             ✅ Done
│   │   ├── env.ts            ✅ Done
│   │   └── redis.ts          ✅ Done
│   ├── controllers/
│   │   ├── signupController.ts       ✅ Done, tested
│   │   ├── loginController.ts        ✅ Done, tested
│   │   ├── refreshController.ts      ✅ Done, tested
│   │   └── verifyTokenController.ts  ✅ Done, tested
│   ├── middleware/
│   │   ├── authGuard.ts      ✅ Written — 🔴 never actually tested (no protected route uses it yet)
│   │   ├── errorHandler.ts   ✅ Done
│   │   └── validate.ts       ✅ Done
│   ├── routes/
│   │   ├── v1/
│   │   │   └── index.ts      ✅ Done — combines authRoutes + internalRoutes under /api/v1
│   │   ├── authRoutes.ts     ✅ Done
│   │   └── internalRoutes.ts ✅ Done
│   ├── utils/
│   │   ├── AppError.ts        ✅ Done
│   │   ├── logger.ts          ✅ Done
│   │   ├── passwordUtils.ts   ✅ Done
│   │   └── tokenUtils.ts      ✅ Done
│   ├── validation/
│   │   └── authSchemas.ts     ✅ Done, fixed (stray `userName` field removed)
│   └── app.ts                  ✅ Done — cookieParser, pinoHttp, v1Routes, errorHandler all wired
├── types/
│   └── express/
│       └── index.d.ts          ✅ Done — req.userId is properly typed
├── server.ts                    ✅ Done, tested (runs on port 4001)
├── prisma.config.ts             ✅ Done
├── tsconfig.json                 ✅ Done
├── package.json                   ✅ Done
├── .env                            ✅ Done (gitignored)
├── .env.example                     🔴 Missing
├── Dockerfile                        🔴 Missing
└── README.md                          🟡 Exists, likely outdated
```

**Big jump since the last version of this doc:** every controller, every route, and the full request pipeline (`validate → controller → errorHandler`) is written **and tested** via Postman — signup, login, refresh, and internal verify-token all return the expected responses.

---

## 2. What's Actually Left — Diagram

```mermaid
flowchart TD
    A[Core flow: signup/login/refresh<br/>✅ DONE + TESTED] --> B{authGuard actually<br/>protecting a route?}
    B -->|Not yet built| C[Build a protected test route<br/>e.g. GET /me]
    C --> D[Confirm authGuard blocks<br/>missing/invalid tokens]
    D --> E[Logout route<br/>clears cookie + deletes DB token]
    E --> F[Duplicate email → clean 409<br/>catch Prisma P2002]
    F --> G[schema.prisma: onDelete Cascade<br/>on RefreshToken → User relation]
    G --> H[Dockerfile for auth-service]
    H --> I[.env.example committed]
    I --> J[README.md updated]
    J --> K[🏁 Phase 2 fully complete]

    style A fill:#d4f7d4,stroke:#3fae3f
    style B fill:#fff4cc,stroke:#d99a2b
    style C fill:#ffd6d6,stroke:#d94a4a
    style D fill:#ffd6d6,stroke:#d94a4a
    style E fill:#ffd6d6,stroke:#d94a4a
    style F fill:#ffd6d6,stroke:#d94a4a
    style G fill:#ffd6d6,stroke:#d94a4a
    style H fill:#ffd6d6,stroke:#d94a4a
    style I fill:#ffd6d6,stroke:#d94a4a
    style J fill:#fff4cc,stroke:#d99a2b
    style K fill:#e8ffe8,stroke:#3fae3f
```

---

## 3. Remaining Items — Table

| # | Item | Location | Why It Matters |
|---|---|---|---|
| 1 | Protected test route to exercise `authGuard` | New: e.g. `src/routes/v1/index.ts` add `GET /auth/me` | `authGuard.ts` was written but never actually run in a real request — need to confirm it correctly blocks missing/invalid/expired tokens and passes valid ones through |
| 2 | Logout route | New controller + route in `authRoutes.ts` | Currently no way to invalidate a refresh token before its 7-day expiry (e.g. user clicks "logout") — should delete the DB row and clear the cookie |
| 3 | Duplicate email → proper `409` | `signupController.ts` | Right now a duplicate signup likely throws a generic `500` — should catch Prisma's `P2002` error code and respond with a clean `409 Email already exists` |
| 4 | `onDelete: Cascade` on the User↔RefreshToken relation | `prisma/schema.prisma` (+ new migration) | Without a real relation, a deleted `User` can leave orphaned `RefreshToken` rows behind — a stolen or leftover token could still generate access tokens for a user that no longer exists |
| 5 | `Dockerfile` | `auth-service/Dockerfile` | Service currently only runs via `npm run dev` locally — needs a Dockerfile to actually join `docker-compose.yml` alongside postgres/redis/mongo |
| 6 | `.env.example` | `auth-service/.env.example` | Real `.env` is gitignored (correctly) — a committed example file (with placeholder values, no real secrets) documents what variables are required for anyone else (or future-you) setting this up |
| 7 | README update | `auth-service/README.md` | Should reflect actual routes, how to run locally, and env vars needed |
| 8 | Refresh token rotation (optional/advanced) | `refreshController.ts` | Discussed earlier — not required for a working service, but strengthens security if a refresh token is ever leaked |

---

## 4. What Each Remaining Item Actually Involves

### 🔴 Protected test route (`GET /me`)
A minimal route that runs `authGuard` before a simple handler that returns `req.userId`. This is the only way to actually verify the guard works — right now it exists as code but has zero real-world confirmation.

### 🔴 Logout
- `POST /api/v1/auth/logout`
- Read refresh token from cookie → `prisma.refreshToken.delete()` (or `deleteMany` matching that token) → `res.clearCookie('refreshToken')` → respond success.

### 🔴 Duplicate email handling
- Wrap `prisma.user.create()` in try/catch inside `signupController.ts`.
- Check `err.code === 'P2002'` → `throw new AppError('Email already exists', 409)`.

### 🔴 Schema relation + cascade delete
```prisma
model User {
  id            String         @id @default(uuid())
  email         String         @unique
  passwordHash  String
  createdAt     DateTime       @default(now())
  refreshTokens RefreshToken[]
}

model RefreshToken {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  token     String
  expiresAt DateTime
}
```
Then: `npx prisma migrate dev --name add_user_relation`

### 🔴 Dockerfile
Standard Node + Prisma pattern:
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npx prisma generate
RUN npm run build
CMD ["node", "dist/server.js"]
```
(Exact contents to be finalized when this step is reached — build step depends on final `tsconfig.json` output settings.)

### 🔴 `.env.example`
```
PORT=4001
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres
REDIS_URL=redis://localhost:6379
JWT_ACCESS_SECRET=replace_with_a_long_random_string
JWT_REFRESH_SECRET=replace_with_a_different_long_random_string
NODE_ENV=development
```

---

## 5. Suggested Order From Here

```mermaid
flowchart LR
    A[1. Protected /me route<br/>test authGuard] --> B[2. Logout route]
    B --> C[3. Fix duplicate-email 409]
    C --> D[4. Schema cascade delete<br/>+ migration]
    D --> E[5. .env.example]
    E --> F[6. Dockerfile]
    F --> G[7. README update]
    G --> H[🏁 Merge phase-0-auth-service<br/>into main]
```

---

## 6. Quick Status Snapshot

```
Core auth flow (signup/login/refresh/verify)   [██████████] 100% — DONE & TESTED
authGuard middleware                            [███████░░░]  70% — written, not exercised
Logout                                          [░░░░░░░░░░]   0% — pending
Duplicate email handling                        [░░░░░░░░░░]   0% — pending
Schema cascade delete                           [░░░░░░░░░░]   0% — pending
Dockerfile                                      [░░░░░░░░░░]   0% — pending
.env.example                                    [░░░░░░░░░░]   0% — pending
README                                          [███░░░░░░░]  30% — exists, outdated
```

---

## 7. Summary — What's Actually Done So Far

- **Database layer:** Prisma is fully wired to Postgres via the `PrismaPg` adapter, `User` and `RefreshToken` tables exist and are migrated.
- **Full signup → login → refresh cycle works end-to-end**, tested through Postman: passwords are hashed with bcrypt, access tokens are short-lived JWTs, refresh tokens are long-lived JWTs stored in the database and also set as an `httpOnly` cookie.
- **Redis is connected** and publishing a `user-created` event on signup (no subscriber yet — that's Phase 3, User Service, not part of this service).
- **Internal token verification route** (`/internal/verify-token`) works, meant for other services (Room, Signaling) to check a token without needing the JWT secret themselves.
- **Centralized error handling** (`AppError` + `errorHandler`) and **structured logging** (`pino`) are in place across all controllers.
- **API is versioned** under `/api/v1`, keeping future breaking changes isolated from this version.
- **What's left is mostly hardening and packaging**, not core logic: proving the auth guard actually protects something, adding logout, cleaning up one error case (duplicate email), tightening the database relation, and finally containerizing the service with a Dockerfile so it can join the rest of the `docker-compose.yml` stack.

**In short: the auth service works. It is not yet "done" in the production-grade, portfolio-ready sense — the remaining 7 items are what separate "it works on my machine via npm run dev" from "it's a properly hardened, containerized microservice."**