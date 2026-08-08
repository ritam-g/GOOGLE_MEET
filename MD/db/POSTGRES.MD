
# Beginner FAQ — Running PostgreSQL with Docker (No Local Install)

> This is a companion to your `Beginner FAQ — Video Meet App Services Explained` doc.
> It focuses only on **PostgreSQL**, and how to run it using **Docker** instead of
> installing it directly on your machine — using an **image** + a **connection string**.

---

## Table of Contents

1. [Why Docker Instead of Installing Postgres](#1-why-docker-instead-of-installing-postgres)
2. [Image vs Container — What&#39;s the Difference?](#2-image-vs-container--whats-the-difference)
3. [The docker-compose.yml File](#3-the-docker-composeyml-file)
4. [Connecting Your App with a Connection String](#4-connecting-your-app-with-a-connection-string)
5. [Where Does the Data Actually Live? (Volumes)](#5-where-does-the-data-actually-live-volumes)
6. [Common Commands You&#39;ll Actually Use](#6-common-commands-youll-actually-use)
7. [How This Fits Your Auth / User / Room Services](#7-how-this-fits-your-auth--user--room-services)
8. [Is This &#34;Enough&#34; for Your Project?](#8-is-this-enough-for-your-project)

---

## 1. Why Docker Instead of Installing Postgres

**Q: I already have Postgres/SQL installed locally — why bother with Docker at all?**
You *can* keep using your local install — it's not wrong. But Docker gives you a few things a local install doesn't:

- You can delete the whole database and start fresh in 2 seconds (`docker compose down -v`) without touching your actual machine.
- Your teammates (or future-you on a new laptop) run the exact same Postgres version with zero setup — just one command.
- It matches how Postgres usually runs in real production (in a container), so there are no "works on my machine" surprises.

**Q: Do I need to install Postgres at all if I use Docker?**
No. Docker downloads a ready-made **image** that already has Postgres installed inside it. You never run an installer.

```mermaid
flowchart LR
    subgraph Old["❌ Old way"]
        A["Download Postgres installer"] --> B["Install on your OS"] --> C["Configure it manually"]
    end
    subgraph New["✅ Docker way"]
        D["docker pull postgres"] --> E["docker run / docker compose up"] --> F["Postgres is running"]
    end
```

---

## 2. Image vs Container — What's the Difference?

**Q: I keep hearing "image" and "container" — are they the same thing?**
No, but they're related:

- **Image** = a frozen, reusable blueprint (e.g. `postgres:16` from Docker Hub). It never changes.
- **Container** = a running, live instance created *from* that image. You can start, stop, or delete it — the image stays untouched.

Think of the image like a recipe, and the container like the actual dish you cooked from it. You can cook (run) the same recipe as many times as you want.

```mermaid
flowchart TD
    Image["postgres:16 image<br/>(the blueprint, from Docker Hub)"] -->|docker run| C1["Container: auth_db<br/>(a running Postgres)"]
    Image -->|docker run| C2["Container: another_db<br/>(another running Postgres)"]
```

---

## 3. The docker-compose.yml File

**Q: What is `docker-compose.yml` actually doing?**
It's a small text file that describes "which images to run, with what settings" so you don't have to type a long `docker run ...` command every time. One file, one command (`docker compose up`), and Postgres is running.

Here's a minimal one for your project:

```yaml
services:
  postgres:
    image: postgres:16
    container_name: videomeet_postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: videomeet
      POSTGRES_PASSWORD: videomeet_pass
      POSTGRES_DB: videomeet_db
    ports:
      - "5433:5432"   # host:container — using 5433 so it won't clash with your local Postgres
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

**Q: Why map port `5433:5432` instead of `5432:5432`?**
The right side (`5432`) is the port *inside* the container — that never changes, it's Postgres's default. The left side (`5433`) is the port on *your* machine. Since you already have a local Postgres using `5432`, mapping to `5433` avoids a conflict. If you don't have a local Postgres running at the same time, you can just use `5432:5432` instead.

---

## 4. Connecting Your App with a Connection String

**Q: How does my app (Auth Service, User Service, Room Service) actually talk to this container?**
Exactly the same way it would talk to a locally installed Postgres — through a **connection string**. The app has no idea it's talking to a container; it just sees an address and port.

```
postgresql://videomeet:videomeet_pass@localhost:5433/videomeet_db
```

Breaking that down:

| Part               | Meaning                                     |
| ------------------ | ------------------------------------------- |
| `postgresql://`  | protocol                                    |
| `videomeet`      | `POSTGRES_USER` from the compose file     |
| `videomeet_pass` | `POSTGRES_PASSWORD` from the compose file |
| `localhost:5433` | your machine, on the port you mapped        |
| `videomeet_db`   | `POSTGRES_DB` from the compose file       |

Put this in a `.env` file for each service (Auth, User, Room), e.g.:

```
DATABASE_URL=postgresql://videomeet:videomeet_pass@localhost:5433/videomeet_db
```

```mermaid
flowchart LR
    Auth["Auth Service"] -->|connection string| PG[("Postgres container<br/>port 5433")]
    User["User Service"] -->|connection string| PG
    Room["Room Service"] -->|connection string| PG
```

**Q: One important note — if a service itself also runs inside Docker later, what changes?**
The host part changes from `localhost` to the **service name** in the compose file (e.g. `postgres`), because containers talk to each other by service name, not `localhost`. For now, since only Postgres is in Docker and your app runs directly on your machine, `localhost` is correct.

---

## 5. Where Does the Data Actually Live? (Volumes)

**Q: If I stop the container, do I lose all my data?**
No — as long as you have a **volume** set up (like `postgres_data` in the file above). The volume lives outside the container, on your actual machine, so your data survives even if the container is deleted and recreated.

**Q: When would I actually lose the data?**
Only if you explicitly run `docker compose down -v` (the `-v` removes volumes too). A normal `docker compose down` or `docker stop` keeps your data safe.

```mermaid
flowchart TD
    Container["Postgres container<br/>(can be stopped/deleted)"] -->|writes data to| Volume[("postgres_data volume<br/>(persists on your machine)")]
    Container2["New Postgres container<br/>(recreated later)"] -->|reads from same| Volume
```

---

## 6. Common Commands You'll Actually Use

| Command                                                                  | What it does                                                          |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| `docker compose up -d`                                                 | Start Postgres in the background                                      |
| `docker compose ps`                                                    | Check if it's running                                                 |
| `docker compose logs -f postgres`                                      | Watch Postgres logs live                                              |
| `docker compose stop`                                                  | Stop it (data is kept)                                                |
| `docker compose down`                                                  | Stop + remove the container (data is kept, volume stays)              |
| `docker compose down -v`                                               | Stop + remove container**and** delete the data — use carefully |
| `docker exec -it videomeet_postgres psql -U videomeet -d videomeet_db` | Open a`psql` shell straight inside the running container            |

---

## 7. How This Fits Your Auth / User / Room Services

Going back to your original architecture doc — Auth, User, and Room services were the ones using Postgres ("spreadsheet with strict rules"). With Docker, all three still use Postgres exactly as described — the only thing that changed is *where* Postgres physically runs.

```mermaid
flowchart TD
    subgraph Docker["Docker (one Postgres container)"]
        PG[("videomeet_postgres<br/>image: postgres:16")]
    end

    Auth["Auth Service"] -->|"connection string<br/>(auth tables/schema)"| PG
    User["User Service"] -->|"connection string<br/>(user profile tables/schema)"| PG
    Room["Room Service"] -->|"connection string<br/>(room tables/schema)"| PG

    style Docker fill:#eef3ff,stroke:#5b7fff
```

You don't need three separate Postgres containers — one container can hold multiple **schemas** or even multiple **databases**, one per service, if you want stricter separation later. For a starting project, one shared database with clearly named tables (`users`, `rooms`, `auth_tokens`, etc.) is perfectly fine.

---

## 8. Is This "Enough" for Your Project?

**Short answer: yes.** For local development of a multi-user app like this (one user, multiple users communicating), Docker + a Postgres image + a connection string is a complete, production-realistic setup. You are not missing a step.

What you get with this approach:

- ✅ No local Postgres install needed
- ✅ Same connection-string pattern your app will use in production
- ✅ Data safely persisted via a volume
- ✅ Easy to wipe and restart while you're still designing your schema
- ✅ Keeps your existing local Postgres install completely untouched (different port)

What's intentionally **not** covered here (fine to skip for now, worth knowing exists later):

- Running your actual app code (Auth/User/Room services) inside Docker too, and connecting containers to each other by service name instead of `localhost`
- Database migrations tooling (e.g. Prisma, Alembic, Flyway) to manage schema changes over time
- Backups / multi-container replicas for real production use

None of those block you from building and testing your project right now.
