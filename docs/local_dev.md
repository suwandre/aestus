# Local development boot sequence

This guide covers installing prerequisites, configuring environment variables,
starting the infrastructure, and running the API and web app.

---

## Prerequisites

| Tool                                                           | Minimum version        | Install                                                           |
| -------------------------------------------------------------- | ---------------------- | ----------------------------------------------------------------- |
| [Bun](https://bun.sh)                                          | 1.1+                   | `curl -fsSL https://bun.sh/install \| bash`                       |
| [Rust + Cargo](https://rustup.rs)                              | 1.77+                  | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| [Docker + Compose plugin](https://docs.docker.com/get-docker/) | Docker 24+, Compose v2 | Platform installer                                                |

All commands assume a POSIX shell (bash/zsh). Windows users: use WSL 2.

---

## 1. Clone and install

```sh
git clone <repo-url> aestus
cd aestus
bun install           # installs all TypeScript workspace packages
cargo fetch           # pre-fetches Rust crates
```

---

## 2. Copy environment files

```sh
cp .env.example .env
cp infra/.env.example infra/.env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
cp services/ingestion/.env.example services/ingestion/.env
```

The default values in the `.example` files are wired to match the local Docker
Compose services and require no editing for a first boot. Edit only if you need
to change ports or credentials.

---

## 3. Start infrastructure

```sh
docker compose -f infra/docker-compose.yml up -d
```

This starts Postgres, Redis, ClickHouse, and NATS JetStream. App services
(API, web, ingestion, features) are in the `app` profile and are not started
here — start them separately once their service code is built.

Wait for all four services to be healthy (~15 s on first pull):

```sh
./scripts/infra-health.sh
```

Expected output when ready:

```
[PASS] NATS JetStream  http://localhost:8222/healthz
[PASS] Redis           localhost:6379
[PASS] Postgres        localhost:5432 db=aestus user=aestus
[PASS] ClickHouse      http://localhost:8123/ping

All dependencies healthy.
```

---

## 4. Run database migrations

```sh
bun run db:migrate
```

This applies Postgres schema migrations (Drizzle ORM) and ClickHouse DDL
scripts. Both are idempotent — safe to run multiple times.

> **Not yet wired**: Migrations are added at P04. Until then this command is a
> no-op.

---

## 5. Start the API

```sh
cd apps/api
bun run dev
```

API listens on `http://localhost:3001` by default.

---

## 6. Start the web app

In a separate terminal:

```sh
cd apps/web
bun run dev
```

Web app opens at `http://localhost:3000`.

---

## 7. Start Rust services (optional)

Ingestion and feature engine are Rust binaries. Build and run them separately:

```sh
cargo run -p ingestion
cargo run -p features
```

Both services connect to NATS via `NATS_URL` from the env file.

---

## Stopping infra

```sh
docker compose -f infra/docker-compose.yml down
```

Data is preserved in Docker volumes. To destroy all local data:

```sh
./scripts/reset-local.sh --confirm
```

---

## Common shortcuts (Makefile)

```sh
make up          # docker compose up -d
make down        # docker compose down
make logs        # follow all container logs
make health      # run infra-health.sh
make reset-local # guided volume reset (prompts for --confirm)
```

---

## Troubleshooting

| Symptom                             | Fix                                                                              |
| ----------------------------------- | -------------------------------------------------------------------------------- |
| `port already in use`               | Check if a previous run left containers up: `docker ps`                          |
| ClickHouse exits immediately        | Likely a volume permission issue — run `make reset-local`                        |
| `bun install` fails                 | Delete `node_modules/` and `bun.lock`, then retry                                |
| Rust crates fail to compile         | Run `rustup update stable`                                                       |
| `infra-health.sh` fails on Postgres | `pg_isready` not installed — install `libpq-dev` (Linux) or `postgresql` (macOS) |
