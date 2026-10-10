# Task API — Rebuild Rust -> TS

A small Task/Todo REST API. It was first written in Rust with [ntex](https://ntex.rs) as a way to
learn Rust, and has now been rebuilt in TypeScript on [Elysia](https://elysiajs.com) and
[Bun](https://bun.sh), still on PostgreSQL.

The rebuild is a straight port. The routes, status codes and JSON are the same; what changed is the
language and the file layout, which now follows Clean Architecture. The TypeScript backend lives in
`backend/`. The Rust source has been removed from the tree; it is still in the git history.

**This repository is a learning exercise, not a product.** The goal was never the API — it was
learning Rust. The API is just the thing I built while doing it.

## How this was built: project-based learning with an AI coach

I already knew Java and OOP, so the gap was Rust specifically, not programming. Instead of reading a
book front to back, I picked a real project and learned each concept at the moment it became
necessary.

I worked through it with Claude acting as a **coach, not an autocomplete**:

- The AI explained concepts, gave function signatures, and named the traps ahead — it did not write
  my code.
- I typed everything myself and hit the compiler errors myself.
- After each step the AI read the code, compiled it, ran the server, and reported what actually
  happened — including the bugs I had missed.
- Every phase ended with self-check questions I had to answer without looking anything up.

That split mattered. The bugs I remember are the ones I wrote: an `Option` that got dropped by a
stray semicolon, a `.bind(id)` that silently stored a UUID as a BLOB so every `WHERE id = ?` quietly
matched zero rows, a whole handler registered on the wrong HTTP verb that compiled and ran and simply
never fired.

## What it does

| Method | Path          | Behaviour                                                       |
| ------ | ------------- | --------------------------------------------------------------- |
| GET    | `/health`     | liveness check                                                   |
| GET    | `/tasks`      | list tasks — newest first, with `status`, `limit`, `offset`, `due_from`, `due_before` |
| POST   | `/tasks`      | create a task — validated, returns `201` + the task              |
| GET    | `/tasks/{id}` | fetch one task, `404` if it does not exist                       |
| PATCH  | `/tasks/{id}` | partial update — only the fields you send                        |
| DELETE | `/tasks/{id}` | delete, `204` on success                                         |

Listing supports filtering and paging:

```
GET /tasks?status=done&limit=20&offset=40
```

`limit` defaults to 20 and must be between 1 and 100. Results are ordered by `created_at`
descending — without a fixed order, paging silently duplicates and skips rows.

A task can have a due date. `due_at` is optional on `POST` and comes back as `null` when it is not
set. On `PATCH` it follows the same rule as `description`: a missing key leaves it alone, `null`
clears it.

```json
{ "title": "learn ntex", "due_at": "2026-10-10T09:00:00+07:00" }
```

`due_at` is an instant, not a calendar date. It is an RFC 3339 timestamp and the offset is required
(`Z` or `+07:00`); it is stored as `timestamptz` and always returned in UTC.

`due_from` (inclusive) and `due_before` (exclusive) filter the list by `due_at`. Each works on its
own. They are instants too, and that is on purpose: "the tasks on 10 October" is a different range in
every timezone, so the client sends its own two midnights and the server never has to guess one.
For someone at UTC+7 that day is:

```
GET /tasks?due_from=2026-10-09T17:00:00Z&due_before=2026-10-10T17:00:00Z
```

A task with no due date matches no range. In a query string a `+` means a space, so write an offset
as `%2B07:00`, or send UTC.

Every error comes back in the same JSON shape, including unknown routes:

```json
{ "error": "not_found", "message": "task not found" }
```

Status codes are used deliberately: `400` when the body will not parse, `422` when it parses but
breaks a validation rule, `404` when the row is not there, `500` for anything the server got wrong.
The dates follow the same split: a `due_at`, `due_from` or `due_before` that is not a timestamp with
an offset is a `400`, and a `due_from` that is not before `due_before` is a `422`.

## Stack

| Piece      | Why                                                                      |
| ---------- | ------------------------------------------------------------------------ |
| Bun        | runtime, package manager, and the PostgreSQL client (`Bun.sql`)           |
| Elysia     | web framework: routing and the one error hook                             |
| TypeScript | strict mode, checked with `tsc --noEmit`                                  |
| PostgreSQL | same database and same `migrations/` as the Rust version, plus `0002`     |

Elysia is the only runtime dependency. There is no validation library: the request parsing is
written by hand in `requestParsing.ts`, because that is the simplest way to keep the `400` / `422`
split exactly as the Rust version had it.

### The Rust version

The original backend used these crates:

| Crate       | Why                                                             |
| ----------- | --------------------------------------------------------------- |
| `ntex`      | web framework (thread-per-core, actix-derived)                   |
| `sqlx`      | async PostgreSQL, compile-time-optional query checking, migrations |
| `serde`     | JSON in and out                                                  |
| `validator` | declarative validation rules on the request structs              |
| `thiserror` | one error enum with the boilerplate generated                    |
| `uuid`      | task ids                                                         |
| `time`      | RFC 3339 timestamps                                              |

### Why ntex and not axum

The project started on axum and moved to ntex a day in, purely out of curiosity about a framework I
had not seen. That turned out to be a real trade-off worth writing down: ntex is fast, but almost
every Rust web tutorial online is written for axum, and ntex's own docs carry very few examples.

The closest thing to documentation is actix-web, which ntex is derived from — and the two are similar
enough to be dangerous. The differences that cost me the most time:

- `HttpServer::new` needs an **async** closure (`AsyncFn`); actix takes a plain one.
- Extractors live in `web::types::`, not `web::`.
- `FromRequest<Err>` carries an extra generic parameter that actix does not have.
- Middleware registers with `.middleware()`, not `.wrap()`.

Reading `docs.rs` type signatures and the ntex source directly ended up being faster than searching.

## Running it

### Everything in Docker

```bash
git clone git@github.com:AlexanderDev-src/rust-ntex-task-api.git
cd rust-ntex-task-api
docker compose up --build
```

That starts PostgreSQL, the API and the frontend. Open <http://localhost:5173>. nginx in the `web`
container serves the built frontend and passes `/api/...` on to the `api` container, so
`http://localhost:5173/api/tasks` is the API's `/tasks`. The API is also published on host port
8080, which is where `test.fish` and the Vite dev server look for it.

The `api` image is built from `backend/Dockerfile` with the repo root as its build context, because
the server reads `migrations/` at startup and that directory sits next to `backend/`.

### The API on the host

For work on the backend, run only the database in Docker and the API with Bun. Both ways of running
the API use port 8080, so stop the `api` container first (`docker compose stop api`).

```bash
docker compose up -d db
printf '%s\n' 'DATABASE_URL=postgres://restapi:restapi@127.0.0.1:5433/tasks' 'PORT=8080' > .env
cd backend
bun install
bun run start
```

`bun run start` reads the `.env` in the repo root.

Migrations run automatically at startup. The server applies the SQL files from `migrations/` and
records them in the same `_sqlx_migrations` table that sqlx used, so a database first set up by the
Rust version is seen as already migrated. The database is published on host port **5433**, not the
usual 5432, so it does not collide with another Postgres already on the machine. Its data lives in the
`pgdata` named volume and survives `docker compose down`; only `docker compose down -v` deletes it.

The `POSTGRES_USER` / `POSTGRES_PASSWORD` values in `docker-compose.yml` are read once, when the
volume is first initialised. Changing them afterwards does nothing until the volume is recreated, so
keep `.env` in step with whatever the volume was created with.

To look at the data directly:

```bash
docker compose exec db psql -U restapi -d tasks -c 'select id, title, status from tasks;'
```

Configuration comes from the environment; `.env` is only a convenience for local work, and real
environment variables take precedence over it:

| Variable       | Required | Default     | Notes                                               |
| -------------- | -------- | ----------- | --------------------------------------------------- |
| `DATABASE_URL` | yes      | —           | startup fails without it                            |
| `HOST`         | no       | `127.0.0.1` | address to listen on; the `api` container sets `0.0.0.0` |
| `PORT`         | no       | 8080        |                                                     |

A missing or malformed value fails fast with one readable line, not a panic:

```
Error: DATABASE_URL is not set
Error: HOST must not be empty
Error: PORT must be a number, got "abc"
```

The default host is loopback, so a server started on the host is not reachable from other machines.
Inside a container loopback means the container itself, which is why `docker-compose.yml` sets
`HOST=0.0.0.0`. An empty `HOST` is refused because Bun would read it as "every interface".

`PORT=4000 bun run start` overrides the file. Ctrl-C shuts down gracefully, giving in-flight requests up
to five seconds to finish.

```bash
curl -X POST localhost:8080/tasks \
  -H 'content-type: application/json' \
  -d '{"title":"learn ntex"}'
```

## Tests

`test.fish` is an acceptance script — 86 checks covering every endpoint, every error path, the
validation rules, the paging behaviour, PATCH semantics, due dates and the date filter. It only speaks HTTP, so the same script
that checked the Rust version checks this one. Start the server first, then in another terminal:

```bash
./test.fish          # or ./test.fish 4000 for a different port
```

It seeds its own tasks and deletes them afterwards, so it is safe to run repeatedly, and every count
it asserts is relative to what it created — leftover rows do not break it. It exits non-zero if
anything fails.

The backend has a type check and no unit tests of its own:

```bash
cd backend && bun run typecheck
```

Two of the acceptance checks are less obvious than the rest and were worth writing: one asserts that page 1
and page 2 share no ids, and one asserts that the same request twice returns the same order. Both
fail the moment `ORDER BY` goes missing, which is exactly the bug that is invisible when you only
ever look at one page.

## Layout

The TypeScript backend is split into the four Clean Architecture layers:

```
backend/
├── package.json, tsconfig.json, bun.lock
├── Dockerfile                        the api image; build context is the repo root
└── src/
    ├── main.ts                       composition root: config, pool, migrations, wiring, listen
    ├── domain/                       the rules, no framework and no database
    │   ├── task.ts                   Task, TaskStatus, TaskId, the title rule, newTask
    │   └── errors.ts                 ValidationError, TaskNotFoundError
    ├── application/                  what the app does, one class per use case
    │   ├── ports/taskRepository.ts   what the use cases need from storage
    │   └── useCases/                 createTask, getTask, listTasks, updateTask, deleteTask
    ├── infrastructure/               the outside world
    │   ├── config.ts                 loadConfig — the only place that reads the environment
    │   └── postgres/
    │       ├── taskRepository.ts     the repository on Bun.sql, all SQL lives here
    │       └── migrations.ts         applies migrations/ at startup
    └── presentation/http/            HTTP only
        ├── taskRoutes.ts             Elysia routes: request in, use case call, response out
        ├── requestParsing.ts         body, query and path parsing — where the 400s come from
        └── responses.ts              the JSON shape of a task; every error becomes a response here
migrations/            versioned schema, read by the server at startup
frontend/              React + TypeScript + Tailwind
docker-compose.yml     PostgreSQL, the API and the frontend
```

Dependencies point inward: `presentation` → `application` → `domain`, and `infrastructure` →
`application` → `domain`. The domain imports nothing from the other layers, the use cases know the
repository only as a type, and `main.ts` is the one file that sees everything and wires it together.

Where each Rust file went (the Rust files are in the git history):

| Rust (`src/`)       | TypeScript (`backend/src/`)                                                    |
| ------------------- | ------------------------------------------------------------------------------ |
| `main.rs`           | `main.ts`                                                                      |
| `config.rs`         | `infrastructure/config.ts`                                                     |
| `models/task.rs`    | `domain/task.ts`                                                               |
| `error.rs`          | `domain/errors.ts` for the errors, `presentation/http/responses.ts` for the status codes |
| `extract.rs`        | `presentation/http/requestParsing.ts`                                          |
| `handlers/tasks.rs` | `presentation/http/taskRoutes.ts` plus `application/useCases/`                 |
| `state.rs`          | `application/ports/taskRepository.ts` and `infrastructure/postgres/taskRepository.ts` |

One piece of logic moved, not just a file: the PATCH merge (keep, replace or clear each field) sat
next to the SQL in `state.rs` and now lives in the `updateTask` use case, so the repository only
stores what it is given.

The Rust version already had a simpler form of this: `handlers` → `state` → `models`, with no SQL in
the handlers and no HTTP in the models.

That layering paid off concretely. Phase 6 replaced an in-memory `Arc<Mutex<HashMap>>` with a real
SQLite pool, and the five handlers changed by adding `.await` — nothing else. The later move from
SQLite to PostgreSQL touched `state.rs`, `main.rs`, the model derives and the migration, and again
no handler. The same acceptance script verified every version.

## Learning path

Each phase was one commit and taught one thing.

| Phase | Topic                     | What it was actually for                                      |
| ----- | ------------------------- | ------------------------------------------------------------- |
| 0     | scaffold                  | crates, targets, what `main.rs` and `lib.rs` each are          |
| 1     | first server              | `async` returns a future that does nothing until awaited       |
| 2     | JSON in and out           | derive macros, extractors, `Responder`                         |
| 3     | shared state + CRUD       | `Arc`, `Mutex`, interior mutability, thread-per-core state     |
| 4     | error handling            | `Result`, `?`, one error enum, `WebResponseError`              |
| 5     | validation                | writing `FromRequest` by hand — how extractors actually work   |
| 6     | SQLite with sqlx          | pools, migrations, async database calls, type mapping          |
| 7     | query params, pagination  | `Query<T>`, `QueryBuilder`, why paging needs `ORDER BY`         |
| 8     | config, graceful shutdown | env-driven config, splitting `main` from `run`, clean shutdown  |

After the eight phases:

| Step        | What it was actually for                                                        |
| ----------- | ------------------------------------------------------------------------------- |
| frontend    | React + TS client behind a Vite dev proxy; one `api.ts` owns every request       |
| PATCH fix   | `Option<Option<String>>` so `null` clears a field and a missing key leaves it    |
| PostgreSQL  | native `uuid` / `timestamptz`, `$1` placeholders, no unsigned integers           |
| TS rebuild  | the same API on Bun + Elysia, with the files regrouped into Clean Architecture   |
| due dates   | `due_at` and a date-range filter; instants on the wire, so the client owns its timezone |
| Docker      | the API in a container: bind address from `HOST`, build context at the repo root  |

### What the PostgreSQL move actually changed

- **Types got real.** SQLite stored the UUID as `TEXT` and needed `.to_string()` on every bind plus
  `#[sqlx(try_from = "String")]` on read — forgetting one silently matched zero rows. Postgres has a
  `uuid` column type, so all of that went away.
- **Placeholders.** `?` became `$1, $2, …`. `QueryBuilder::push_bind` numbers them itself.
- **No unsigned integers.** `u32` does not encode for Postgres, so `limit` / `offset` became `i64`.
  That removed the free rejection of negative numbers, so `offset` now needs an explicit
  `range(min = 0)` — and `?limit=-1` is a `422` (parsed, then refused) instead of a `400`.
- **`type_name` must match the schema.** `#[sqlx(type_name = "task_status")]` told sqlx the column
  was a Postgres enum that the migration never created; every insert failed with a generic
  `database error`. The column is `TEXT`, so the derive says `TEXT`.

### What the TypeScript rebuild actually changed

The port was checked by sending the same 118 requests to both servers and comparing the answers.
Status codes and content types match on all but the cases below. These are the known differences:

- **Timestamps have millisecond precision.** A JS `Date` holds milliseconds, so `created_at` is
  always `2026-09-08T09:41:00.123Z`. Rust returned nanoseconds from `POST` and microseconds when
  reading the row back.
- **Parse error messages are worded differently.** The status is still `400` and the `error` code is
  still `bad_request`, but the text for broken JSON comes from the JavaScript parser, and there is no
  `at line 1 column 12` suffix. The plain-text `404` for an id that is not a UUID no longer says
  which character was wrong.
- **JSON bodies are read more strictly in one way and less in another.** serde accepted a JSON array
  as a struct, so `["title", null]` created a task; now it is a `400`. serde rejected a repeated key;
  `JSON.parse` keeps the last one.
- **`HEAD` works.** Elysia answers `HEAD /tasks` like `GET` without the body. ntex sent it to the
  `404` handler.
- **`/health` has a content type** (`text/plain`). ntex sent none.
- **`WORKERS` is gone.** Bun runs one process.

Deliberately out of scope: authentication, tracing and OpenAPI. They are
worth doing, but each is its own topic and would have blurred the phase it landed in.

## Status

All eight phases are done, and the API has been rebuilt in TypeScript in `backend/`. The Rust code
it was ported from is removed. Since the rebuild, tasks have a due date with a date-range filter, and
`docker compose up --build` brings up the whole stack: database, API and frontend. The 86-check
acceptance script passes.

This is learning code. It has no auth and no rate limiting, the backend has no unit tests, and none
of it is hardened for anything. Do not run it in production.

## Working with Claude

<p align="center">
  <img src="https://img.shields.io/badge/Built%20with-Claude-D97757?logo=claude&logoColor=white" alt="Built with Claude">
</p>

The coach in "How this was built" was [Claude](https://claude.ai), running in Claude Code. Its job
was to make me better at Rust, not to write the backend for me. This is what it actually did.

**Planning and teaching**

- Wrote the phase plan: nine phases from an empty `cargo new` to config and shutdown, each one
  commit and one concept.
- Explained each concept as the difference from Java, since that is what I already knew. Ownership
  and borrowing got the long version.
- Asked self-check questions at the end of each phase and marked my answers, including the parts I
  got wrong.

**Checking my work instead of trusting it**

- After I wrote something, it compiled it, ran clippy, started the server, and hit it with curl —
  then reported what happened, not what should have happened.
- Tracked down bugs I could not see, such as the UUID bound as a BLOB, the unused `body` warning
  that meant a PATCH handler never applied anything, the `min-h-0` that should have been `min-w-0`,
  and the `type_name` that pointed at a Postgres enum that did not exist.
- Owned up to its own mistakes, like the time it blamed my code for 500s that were really caused by
  three stray server processes it had started itself.

**Verifying before claiming**

ntex has few examples online, so instead of answering from memory Claude built small throwaway
projects to check each API before explaining it: how `FromRequest` looks in ntex 3, whether sqlx
runs under ntex's runtime, how `Uuid` actually lands in SQLite, which `ntex-cors` version works with
ntex 3, and whether Postgres accepts `u32`. Several of those checks overturned what it had said
before.

**Things it did write**

- `test.fish`, the acceptance script, extended at each phase so I could debug on my own.
- This README.
- Git commits when I asked for them.
- The TypeScript rebuild in `backend/`. It is a port of my Rust code, compared against the running
  Rust server request by request.
- What came after the rebuild: due dates (`due_at`, the date filter, migration `0002`) and the API's
  Dockerfile.

The Rust backend code (now in the git history), the SQL, and the fixes are mine. Claude's part there was making
sure I understood why each line was there and catching it when it was wrong.
