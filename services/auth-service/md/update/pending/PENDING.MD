# Auth Service — Pending Items (v5)

> Phase 2 of the Video Meet App build. Core signup/login/refresh/logout flow works and is tested; the service is Dockerized and running as a container. This file lists **only what's left** — confirmed done items are in the full progress tracker, not repeated here.

---

## 1. Pending Items Diagram

```mermaid
flowchart TD
    START([Auth Service — Final Review]) --> CHECK{Review remaining items}

    CHECK --> A[Generated Prisma Folder]
    CHECK --> B[Postman 3-Case Test]
    CHECK --> C[signupController.ts]
    CHECK --> D[prisma/schema.prisma]
    CHECK --> E[.dockerignore]
    CHECK --> F[.env.example]
    CHECK --> G[.env.docker]
    CHECK --> H[README.md]

    A --> A1{Is generated/prisma/ still required?}
    A1 -->|No / Stale| A2[Delete generated/prisma/]
    A1 -->|Yes| A3[Verify schema.prisma<br/>generator block]

    B --> B1[Run Authentication Tests]
    B1 --> B2[No Token]
    B1 --> B3[Fake / Invalid Token]
    B1 --> B4[Valid / Real Token]

    C --> C1[Handle Prisma P2002 Error]
    C1 --> C2[Return HTTP 409<br/>Duplicate Email]

    D --> D1[Add onDelete: Cascade]
    D1 --> D2[RefreshToken → User]
    D2 --> D3[Create New Prisma Migration]

    E --> E1[Create .dockerignore]
    E1 --> E2[Exclude node_modules]
    E1 --> E3[Exclude .env]
    E1 --> E4[Exclude dist]
    E1 --> E5[Exclude .git]

    F --> F1[Create .env.example]
    F1 --> F2[Document Required<br/>Environment Variables]
    F2 --> F3[No Real Secrets]

    G --> G1[Review Docker Environment]
    G1 --> G2{Using Docker<br/>Service Names?}
    G2 -->|Yes| G3[Keep Configuration]
    G2 -->|No| G4[Replace localhost<br/>with Docker Service Names]

    H --> H1[Update README]
    H1 --> H2[Actual API Routes]
    H1 --> H3[Docker Run Steps]
    H1 --> H4[Environment Variables]

    A2 --> DONE
    A3 --> DONE
    B2 --> DONE
    B3 --> DONE
    B4 --> DONE
    C2 --> DONE
    D3 --> DONE
    E2 --> DONE
    E3 --> DONE
    E4 --> DONE
    E5 --> DONE
    F3 --> DONE
    G3 --> DONE
    G4 --> DONE
    H2 --> DONE
    H3 --> DONE
    H4 --> DONE

    DONE([Auth Service Review Complete])

    classDef review fill:#fff4cc,stroke:#d99a2b,stroke-width:2px
    classDef critical fill:#ffd6d6,stroke:#d94a4a,stroke-width:2px
    classDef action fill:#dff3e4,stroke:#4a9b61,stroke-width:2px
    classDef final fill:#d9e8ff,stroke:#4a78c2,stroke-width:2px

    class A,B,G,H review
    class C,D,E,F critical
    class A2,A3,B2,B3,B4,C2,D3,E2,E3,E4,E5,F3,G3,G4,H2,H3,H4 action
    class START,DONE final
```

---

## 2. Pending Items — Table

| # | Item | Location | What To Do | Why It Matters |
|---|---|---|---|---|
| 1 | Resolve `generated/prisma/` folder | `auth-service/generated/prisma/` | Open `prisma/schema.prisma`, check the `generator client { }` block. If it says `provider = "prisma-client-js"` with **no** `output` line, the folder is stale leftover from before the generator switch — safe to delete (`Remove-Item -Recurse generated`). If it still says `provider = "prisma-client"` with an `output` path, the switch never fully happened — needs to be redone | The switch to `prisma-client-js` was the fix for the Docker "module not found" errors (broken relative imports at depth). If this folder is still active, that bug risk is still present |
| 2 | Confirm `/me` route works | Postman (no code change needed unless it fails) | Run 3 tests: (a) no token → expect `401`, (b) fake token (`Bearer fake_token_123`) → expect `401`, (c) real token from a fresh login → expect `200` with `{ userId }` | This is the only remaining proof that `authGuard` actually protects a route correctly — it was written but never exercised against a real request |
| 3 | Duplicate email → clean `409` | `src/controllers/signupController.ts` | In the `catch` block, add a check before the generic 500: `if (err.code === 'P2002') { return next(new AppError('Email already exists', 409)); }` | Right now a duplicate signup falls into the generic `500` branch — leaks a less useful error and wrong status code |
| 4 | `onDelete: Cascade` on User↔RefreshToken | `prisma/schema.prisma` | Add a real `@relation` between `RefreshToken.userId` and `User.id` with `onDelete: Cascade`, then run `npx prisma migrate dev --name add_user_relation` | Without this, deleting a `User` can leave orphaned `RefreshToken` rows behind — a leftover token could still generate valid access tokens for a user that no longer exists |
| 5 | `.dockerignore` | `auth-service/.dockerignore` | Create it — typically excludes `node_modules`, `.env`, `.env.docker`, `dist`, `.git`, `md/` | Confirmed missing from the root directory listing. Keeps the Docker build context small and avoids accidentally copying secrets or local artifacts into the image |
| 6 | `.env.example` | `auth-service/.env.example` | Create with placeholder values: `PORT`, `DATABASE_URL`, `REDIS_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `NODE_ENV` — no real secrets | Confirmed missing. Documents what env vars are required for anyone (including future-you) setting this up from scratch |
| 7 | Review `.env.docker` content | `auth-service/.env.docker` | Confirm `DATABASE_URL`/`REDIS_URL` use Docker service names (`postgres`, `redis`) rather than `localhost`, and confirm `docker-compose.yml`'s `env_file` for `auth-service` actually points to this file | File exists but its contents haven't been reviewed yet in this conversation |
| 8 | README update | `auth-service/README.md` | Update to reflect actual routes (`/api/v1/auth/*`, `/api/v1/internal/*`), how to run via Docker, and required env vars | Exists but outdated relative to current implementation |

---

## 3. Suggested Order

```mermaid
flowchart LR
    A[1. Check schema.prisma generator<br/>+ resolve generated/ folder] --> B[2. Run /me 3-case test]
    B --> C[3. Duplicate email → 409]
    C --> D[4. Cascade delete + migration]
    D --> E[5. .dockerignore]
    E --> F[6. .env.example]
    F --> G[7. Review .env.docker]
    G --> H[8. README update]
    H --> I[🏁 Merge phase-0-auth-service into main]
```

**Why this order:** items 1–2 are pure verification (no new code, just confirming existing work is correct) — cheapest to knock out first. Items 3–4 are small, self-contained code changes. Items 5–8 are config/documentation, safe to do last since they don't affect runtime behavior.

---

## 4. Quick Status Snapshot

```
generated/ folder resolution     [░░░░░░░░░░]   0% — needs a check, not new code
/me 3-case test confirmation     [░░░░░░░░░░]   0% — needs to be run
Duplicate email → 409            [░░░░░░░░░░]   0% — pending
Cascade delete relation          [░░░░░░░░░░]   0% — pending
.dockerignore                    [░░░░░░░░░░]   0% — pending
.env.example                     [░░░░░░░░░░]   0% — pending
.env.docker review               [░░░░░░░░░░]   0% — pending
README update                    [███░░░░░░░]  30% — exists, outdated
```