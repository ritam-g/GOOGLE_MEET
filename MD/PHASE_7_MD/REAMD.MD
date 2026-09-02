# Phase 7 — TURN/STUN: NAT Traversal (Deep Explanation + Full Build Guide)

> **Branch:** `phase-7-turn-stun`
> **Status:** Planning
> **Prerequisites:** Phase 6 verified — real RTCPeerConnection, real SDP, real media flowing between two tabs on localhost.

---

## Table of Contents

1. [The Core Problem — What NAT Actually Is](#1)
2. [STUN — How It Solves the Easy Case](#2)
3. [Why STUN Fails — Symmetric NAT and Strict Firewalls](#3)
4. [TURN — The Fallback Relay](#4)
5. [ICE — The Algorithm That Tries Everything](#5)
6. [How TURN Credentials Work — HMAC Auth Explained](#6)
7. [Architecture in This Project](#7)
8. [What Changes, What Doesnt](#8)
9. [Full Build Plan — File by File](#9)
10. [Testing Plan](#10)
11. [Status Checklist](#11)

---

## 1. The Core Problem — What NAT Actually Is

### Background: IPv4 ran out of addresses

There are ~4.3 billion IPv4 addresses. There are ~15 billion internet-connected devices. This does not add up.

The fix invented in the 1990s: **NAT (Network Address Translation)**.

Your home router has **one** public IP (assigned by your ISP). Every device on your home network shares that one public IP. The router keeps a table mapping `(internal device IP + port)` to `(public IP + assigned port)`.

```
Your home network (private)         Internet (public)
─────────────────────────────       ─────────────────
Laptop:   192.168.1.10:5000  ──┐
Phone:    192.168.1.11:5000  ──┼──►  Router: 203.0.113.5  ──►  Internet
Smart TV: 192.168.1.12:5000  ──┘     (one public IP, many ports)
```

### Why this breaks P2P (WebRTC)

For two browsers on different home networks to send video directly, **Browser B needs to know Browser A's reachable IP:port**. But Browser A only knows its **private** IP (`192.168.1.10`) — meaningless on the internet.

```
Browser A                          Browser B
192.168.1.10 (private)            10.0.0.5 (private)
     |                                  |
  Router A                          Router B
203.0.113.5 (public)              198.51.100.8 (public)

A wants to connect directly to B but only knows B's private IP — unreachable.
```

**The question STUN and TURN both answer: how do browsers discover IPs they can actually reach each other at?**

---

## 2. STUN — How It Solves the Easy Case

### What STUN does

STUN (Session Traversal Utilities for NAT) is the simplest possible trick: ask a server on the public internet **"what IP and port do you see my packets coming from?"**

That IP:port is your **reflexive address** — the public-facing address your router assigned. On most home networks, this works.

```
1. Browser A (192.168.1.10) contacts STUN server
2. Router A forwards packet from 203.0.113.5:54321
3. STUN Server replies: "You look like 203.0.113.5:54321"
4. Browser A knows its reflexive address: 203.0.113.5:54321
5. Browser A tells Browser B via Signaling: "My candidate: 203.0.113.5:54321"
6. Browser B sends UDP to 203.0.113.5:54321
7. Router A receives packet, routes to 192.168.1.10 — Direct P2P!
```

STUN is free, stateless, requires almost zero bandwidth. Google's `stun.l.google.com:19302` in your Phase 6 code is exactly this.

### The code in your project (Phase 6 — already working)

In [test-client/app.js](file:///c:/Users/swaru/OneDrive/Desktop/PROJECT/GOOGLE_MEET/test-client/app.js):

```javascript
// createPeerConnection() — Phase 6
const peer = new RTCPeerConnection({
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },   // THIS is STUN
        { urls: 'stun:stun1.l.google.com:19302' },
    ],
});
```

Phase 6 worked because both tabs were on the same machine — ICE found a host candidate before it even needed STUN. But for different networks, STUN is needed — and sometimes not enough.

---

## 3. Why STUN Fails — Symmetric NAT and Strict Firewalls

### Symmetric NAT — the killer edge case

In a **symmetric NAT** router, the public port assigned is different for **every different destination**:

```
Browser A contacts STUN server (8.8.8.8):
    Router assigns: 203.0.113.5:54321  <-- STUN sees this

Browser A contacts Browser B (198.51.100.8):
    Router assigns: 203.0.113.5:99999  <-- DIFFERENT PORT
```

When A tells B "connect to me at `203.0.113.5:54321`" and B actually tries — the router sees an unexpected incoming packet and **drops it**.

```
STUN tells A: your public is 203.0.113.5:54321
A tells B via signaling: use 203.0.113.5:54321
B tries to connect to 203.0.113.5:54321
Router A drops it! (new source IP, not in NAT table)  FAIL
```

### Who has Symmetric NAT?

- Corporate networks (IT-managed firewalls with strict NAT)
- Mobile carrier networks (CGNAT — Carrier-Grade NAT — almost always symmetric)
- Hotel/public WiFi networks

Industry data shows ~20-30% of real-world WebRTC connections need TURN fallback.

---

## 4. TURN — The Fallback Relay

### The concept

When STUN fails, ICE falls back to **TURN**. Both browsers send media **through** the TURN server instead of directly to each other.

```
STUN path (most users — ~70-80%):
Browser A  <─────── Direct P2P UDP ──────►  Browser B
            (media bypasses all servers)

TURN path (restrictive NAT — ~20-30%):
Browser A ──► coturn (:3478) ──► Browser B
Browser B ──► coturn (:3478) ──► Browser A
            (media relays through your server)
```

### Trade-offs

| | STUN / Direct P2P | TURN Relay |
|---|---|---|
| **Latency** | Best (direct path) | Higher (extra server hop) |
| **Bandwidth cost** | Zero | Your server pays for all media bandwidth |
| **Success rate** | ~70-80% of real users | ~100% (works everywhere) |
| **When used** | ICE tries this first | Only if direct fails |

**coturn** is the open-source server that does both STUN and TURN. One binary, one container.

---

## 5. ICE — The Algorithm That Tries Everything

### What ICE is

ICE (Interactive Connectivity Establishment) is the algorithm browsers run automatically to find the best network path. It is what generates those `ice-candidate` events you saw in Phase 6.

```
ICE gathers 3 types of candidates:

1. HOST candidates
   LAN/loopback: 192.168.1.10:5000
   Works: same-network (Phase 6 used these)

2. SERVER REFLEXIVE candidates (srflx)
   STUN-discovered public: 203.0.113.5:54321
   Works: most home networks

3. RELAY candidates
   TURN server: turn-server.com:3478
   Works: EVERYTHING — the last resort

ICE tries all in priority order: host > srflx > relay
Picks lowest-latency working path.
```

**Key insight:** ICE is automatic. Your code does not pick STUN vs TURN — you just provide all the `iceServers` and the browser figures out which one works. Adding TURN does NOT change the signaling flow — it just gives ICE more options.

---

## 6. How TURN Credentials Work — HMAC Auth Explained

### Why you cannot use static credentials

If you hardcoded credentials in your frontend:

```javascript
// NEVER do this
iceServers: [{ urls: 'turn:yourserver.com', username: 'user', credential: 'pass123' }]
```

Anyone who opened DevTools would see them. They could relay their own video calls at your cost indefinitely.

### The coturn REST API auth scheme

coturn supports **time-limited, HMAC-signed credentials** — impossible to forge without the shared secret, automatically expire after a short time.

```
Full flow:

Browser ──► GET /v1/auth/turn-credentials (Bearer JWT) ──► API Gateway ──► Auth Service

Auth Service computes:
    expiry     = now + 600 seconds
    username   = "expiry:userId"       e.g. "1756980000:user-uuid"
    credential = Base64(HMAC-SHA1(username, TURN_SECRET))

Auth Service returns:
    { iceServers: [ { urls: stun:... }, { urls: turn:..., username, credential } ] }

Browser creates RTCPeerConnection({ iceServers })

If TURN needed, browser sends to coturn:
    TURN ALLOCATE request (username + credential)

coturn independently computes:
    HMAC-SHA1(username, TURN_SECRET)
    checks if it matches credential
    checks if timestamp (expiry) is in the future
    grants or rejects

Auth Service and coturn share TURN_SECRET — never sent over network.
```

### The math — why this is secure

```
username   = "1756980000:user-uuid-here"
              ^expiry     ^user ID

credential = Base64( HMAC-SHA1("1756980000:user-uuid-here", TURN_SECRET) )
```

- Both Auth Service and coturn know `TURN_SECRET`. They never transmit it.
- coturn recomputes the HMAC from the username. If it matches + timestamp is future: access granted.
- After timestamp passes: invalid. Browser must fetch new ones.
- An attacker who intercepts the credential gets 10 minutes max, then worthless.

---

## 7. Architecture in This Project

```
Browser (test-client / future React app)
│
├── fetch /v1/auth/turn-credentials
│       │
│       ▼
│   API Gateway :4000
│       │ (proxies to auth-service)
│       ▼
│   Auth Service :4001
│       authGuard ──► getTurnCredentials()
│       crypto.createHmac('sha1', TURN_SECRET)
│       returns { iceServers: [stun + turn entries] }
│       │
│◄──────┘
│
├── new RTCPeerConnection({ iceServers })
│       │ (if P2P fails, uses coturn :3478)
│       ▼
│   coturn container
│       recomputes HMAC-SHA1(username, TURN_SECRET)
│       validates expiry
│       allocates relay address if valid
│
└── socket.io ──► Signaling Service :4004
        relay.ts (offer/answer/ice-candidate — UNCHANGED)
        Redis (room membership — UNCHANGED)
```

---

## 8. What Changes, What Doesnt

**TURN does NOT touch signaling at all.**

The entire offer → answer → ice-candidate flow through your Signaling Service is unchanged. TURN only changes what candidates the browser *generates* and which path media *travels on*. The signaling pipe is identical.

```
UNCHANGED from Phase 5/6:
  services/signaling-service/  (relay.ts, joinRoom.ts, all handlers)
  services/room-service/
  services/user-service/
  The offer/answer/ICE sequence

CHANGES in Phase 7:
  docker-compose.yml            + coturn block
  infra/coturn/turnserver.conf  NEW FILE
  auth-service/.env             + TURN_SECRET, TURN_REALM
  auth-service/turnController.ts  NEW FILE
  auth-service/authRoutes.ts    + 1 route
  api-gateway                   + /auth/turn-credentials in pathFilter
  test-client/app.js            + fetchIceServers() before createPeerConnection()
```

---

## 9. Full Build Plan — File by File

### Step 1 — coturn in docker-compose.yml

File: [docker-compose.yml](file:///c:/Users/swaru/OneDrive/Desktop/PROJECT/GOOGLE_MEET/docker-compose.yml)

```yaml
  coturn:
    image: coturn/coturn:latest
    container_name: coturn
    restart: unless-stopped
    network_mode: host
    volumes:
      - ./infra/coturn/turnserver.conf:/etc/coturn/turnserver.conf
```

Why `network_mode: host`: coturn needs a wide range of UDP ports (49152-65535) for media relay — one port per active relay session. Mapping thousands of ports through Docker is impractical. `network_mode: host` gives direct host-network access, which is the official coturn-in-Docker recommendation.

---

### Step 2 — coturn config file

File: `infra/coturn/turnserver.conf` (new file, new folder)

```conf
listening-port=3478
fingerprint
lt-cred-mech
use-auth-secret
static-auth-secret=REPLACE_WITH_LONG_RANDOM_SECRET
realm=videomeet.local
total-quota=100
stale-nonce=600
no-multicast-peers
```

| Line | What it does |
|---|---|
| `listening-port=3478` | Standard STUN/TURN port (IANA assigned) |
| `fingerprint` | Adds integrity fingerprint to STUN messages |
| `lt-cred-mech` | Long-term credential mechanism (required for use-auth-secret) |
| `use-auth-secret` | HMAC-based auth — no stored usernames/passwords |
| `static-auth-secret=...` | Shared secret — must EXACTLY match TURN_SECRET in auth-service |
| `realm=videomeet.local` | Namespace for HMAC — must match TURN_REALM in auth-service |
| `total-quota=100` | Max concurrent relay sessions (abuse protection) |
| `stale-nonce=600` | Reject nonces older than 10 min (replay protection) |
| `no-multicast-peers` | Block relay to multicast addresses |

Generate the secret:

```powershell
[Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
```

---

### Step 3 — Auth Service env vars

Files: `auth-service/.env`, `.env.docker`, `.env.example`

```env
TURN_SECRET=your_generated_secret_here
TURN_REALM=videomeet.local
```

The TURN_SECRET must be the exact same string as `static-auth-secret` in turnserver.conf.

---

### Step 4 — Auth Service: turnController.ts

File: `auth-service/src/controllers/turnController.ts` (new file)

```typescript
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { successResponse } from '../utils/response.js';

const TURN_SECRET = process.env.TURN_SECRET!;
const TURN_REALM  = process.env.TURN_REALM ?? 'videomeet.local';

/**
 * GET /turn-credentials
 *
 * Generates short-lived TURN credentials using coturn REST API auth scheme:
 *   username   = "<expiry_unix_timestamp>:<userId>"
 *   credential = Base64( HMAC-SHA1(username, TURN_SECRET) )
 *
 * coturn independently recomputes this HMAC to validate.
 * No credential is ever stored — computed on demand, expires automatically.
 *
 * Why HMAC-SHA1 (not SHA256): coturn REST API scheme specifies SHA1.
 * Acceptable — this is a short-lived bandwidth token (600s TTL), not password storage.
 */
export const getTurnCredentials = (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const TTL_SECONDS = 600; // 10 minutes
        const expiry      = Math.floor(Date.now() / 1000) + TTL_SECONDS;

        // req.userId attached by authGuard — same as /me, /logout, etc.
        const username = `${expiry}:${req.userId}`;

        // HMAC-SHA1 of username, base64-encoded — coturn required format
        const hmac       = crypto.createHmac('sha1', TURN_SECRET);
        hmac.update(username);
        const credential = hmac.digest('base64');

        successResponse(res, {
            iceServers: [
                // STUN first — free, no bandwidth cost
                { urls: `stun:localhost:3478` },
                // TURN — only used when direct/STUN fails
                { urls: `turn:localhost:3478`, username, credential },
            ],
        });
    } catch (err) {
        next(err);
    }
};
```

Why userId in username: coturn logs show which user generated each relay session — useful for debugging bandwidth abuse later.

---

### Step 5 — Wire the route

File: `auth-service/src/routes/authRoutes.ts`

```typescript
import { getTurnCredentials } from '../controllers/turnController.js';

// Protected by authGuard — same as /me, /logout
router.get('/turn-credentials', authGuard, getTurnCredentials);
```

---

### Step 6 — Gateway pathFilter

In your existing Gateway config, add `/auth/turn-credentials` to the protected auth proxy pathFilter alongside `/auth/me` and `/auth/logout`. No new proxy rule needed.

---

### Step 7 — Frontend: fetchIceServers

File: `test-client/app.js`

```javascript
// Add at module scope
let cachedIceServers = null;

/**
 * Fetches TURN credentials from Auth Service via Gateway.
 * Must be called BEFORE creating RTCPeerConnection.
 * Credentials expire after 600s — fetch fresh for each new call.
 */
async function fetchIceServers(token) {
    log('info', 'Fetching TURN credentials from Auth Service...');
    try {
        const res  = await fetch('http://localhost:4000/v1/auth/turn-credentials', {
            headers: { Authorization: `Bearer ${token}` },
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.message ?? 'fetch failed');
        log('success', 'TURN credentials received — expires in ~10 min');
        return body.data.iceServers;
    } catch (err) {
        log('warn', `TURN fetch failed: ${err.message} — falling back to public STUN`);
        return [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
        ];
    }
}

// In Join button handler — fetch BEFORE joinRoom:
// cachedIceServers = await fetchIceServers(token);

// Modify createPeerConnection to accept iceServers param:
// function createPeerConnection(targetSocketId, iceServers) {
//     const peer = new RTCPeerConnection({ iceServers });
//     ...
// }

// Pass in startCall() and handleOffer():
// pc = createPeerConnection(targetSocketId, cachedIceServers);
```

---

## 10. Testing Plan

| # | Test | How | Expected |
|---|---|---|---|
| 1 | coturn starts | `docker compose up -d coturn` then `docker logs coturn` | No fatal errors; listening on 3478 |
| 2 | Credential endpoint authenticated | GET /v1/auth/turn-credentials with valid token | 200 + iceServers array |
| 3 | Credential endpoint no token | Same request, no Authorization header | 401 |
| 4 | Credential format | Check username field in response | "1756980000:user-uuid" format |
| 5 | Existing 2-tab test | Repeat Phase 6 test | Still connects — TURN addition broke nothing |
| 6 | Real cross-network | One device on WiFi, one on mobile data | Call connects — actual TURN proof |

### Test 6 — why it is the only real proof

On localhost, ICE always finds a direct path first, so TURN never gets used. Test 6 is the only test that forces ICE to actually fall back to TURN relay.

### How to read chrome://webrtc-internals

During a call in Chrome, open chrome://webrtc-internals and look at the nominated ICE candidate pair:

```
candidateType: relay   <-- TURN is being used
candidateType: host    <-- direct/LAN path (same machine)
candidateType: srflx   <-- STUN worked (most home networks)
```

---

## 11. Status Checklist

```
Step 1: coturn in docker-compose.yml          [ ] 0%
Step 2: infra/coturn/turnserver.conf          [ ] 0%
Step 3: TURN_SECRET + TURN_REALM env vars     [ ] 0%
Step 4: auth-service/turnController.ts        [ ] 0%
Step 5: authRoutes.ts /turn-credentials       [ ] 0%
Step 6: Gateway pathFilter update             [ ] 0%
Step 7: test-client/app.js fetchIceServers    [ ] 0%

Test 1: coturn container starts               [ ]
Test 2: Credential endpoint 200               [ ]
Test 3: Unauthenticated gets 401              [ ]
Test 4: Credential format correct             [ ]
Test 5: Existing 2-tab test still works       [ ]
Test 6: Real cross-network call               [ ]
```

Immediate next action: Step 1 — add coturn to docker-compose.yml, then Step 2.

---

## Quick Reference Summary

```
STUN   = "Tell me my public IP"
         Free. Stateless. No bandwidth. Works ~70-80% of real users.

TURN   = "Relay my media through your server when P2P fails"
         Costs bandwidth. Works 100% of users. Last resort only.

ICE    = "Try every possible path (host > srflx > relay), use the best"
         Automatic. You just provide iceServers, browser handles the rest.

HMAC   = "Prove you are allowed to use our relay, for 10 minutes only"
         credential = Base64(HMAC-SHA1(username, TURN_SECRET))
         Expires. Impossible to forge without TURN_SECRET.

KEY INSIGHT:
Adding TURN does NOT change a single line of signaling code.
relay.ts is unchanged. joinRoom.ts is unchanged.
The offer/answer/ICE sequence through your Signaling Service is untouched.
TURN only gives ICE more candidate options.
Everything proved in Phases 5 and 6 is untouched.
```
