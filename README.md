# Corporate Doorprize Management & Live Draw

A production-ready, admin-controlled doorprize system for a single company event (~400 employees, 10+ prizes). Winners are selected **on the server**, persisted before anything is shown, and revealed sequentially on a read-only projector display.

## Non-negotiable rules

1. **ONCE:** one Employee ID can win at most one prize per event. Enforced by a database partial unique index, not by UI logic.
2. **Every announcement shows both Employee ID and Employee Name**, including the batch summary and exports.
3. **Only the admin dashboard can control draws.** The projector page is a sanitized, read-only consumer. It has no draw, reveal, pause or void controls.

## What is included

- Email/password admin auth with an `admin_profiles` allowlist, middleware protection and route-handler re-verification.
- Participant intake from **Excel (`.xlsx`/`.xls`)**, **copy/paste (TSV/CSV)** and **manual entry**, with a browser-side validation preview and an explicit replace/sync confirmation showing added, renamed and removed IDs.
- Roster lock after the first draw session; any later roster change needs a written override reason and is audited. Winners referenced by a roster change are never deleted.
- Prize CRUD, reordering, activation and live remaining quantities.
- Server-side CSPRNG draws (`gen_random_uuid()`, never SQL `random()`), atomic session creation, persisted reveal index, refresh/network recovery, pause/resume, cancel and void + audited re-draw.
- Four **visual-only** presentation modes: Spin Wheel, Name Roller, Random Picker and Lottery Balls. Animation never influences selection.
- Full winner history with voided results preserved, CSV/XLSX export and an append-only audit log.
- 16:9 cinematic display with polling every second, sound, full-screen mode, and a rotatable unguessable capability link.

## Quick start (local, ~5 minutes)

Requirements: Node.js 20.9+, npm, Docker, and the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started).

```bash
npm install
cp .env.example .env.local
supabase start            # prints local anon + service_role keys
# paste the printed keys into .env.local
npm run db:reset          # applies supabase/migrations + supabase/seed.sql
npm run dev
```

Open:

| URL | Purpose | Credentials |
|---|---|---|
| `http://localhost:3000/login` | Admin console | `admin@doorprize.local` / `Admin123!` |
| `http://localhost:3000/display/local-demo-display-5f3a9c2e7b1d4806ba47e91c2d6f8305` | Local demo projector (read-only) | none |

The seed creates one event with 400 participants and 10 prizes. **`seed.sql` is for local/demo use only — never run it against production.**

Sample uploads are in [`data/sample-participants.csv`](data/sample-participants.csv) (400 rows) and [`data/sample-prizes.csv`](data/sample-prizes.csv) (10 rows). The participant parser ignores extra columns such as `Department`.

## Docker

```bash
# after npm install (generates package-lock.json) and configuring .env.local
docker compose up --build -d
docker compose logs -f app
```

The image uses Next.js standalone output, runs as a non-root user and exposes port 3000. Supabase itself is normally local via `supabase start` (Docker-backed) or hosted; the app container connects through `NEXT_PUBLIC_SUPABASE_URL`.

## Typical event flow

1. Create an event, set date, branding, display defaults, set status to **Ready** or **In Progress**, and enable the public display.
2. Import or enter the roster. Review the validation preview and the replace/sync diff, then commit.
3. Add prize categories and quantities.
4. Open the projector link on the LED/ projector browser and put it in fullscreen (`F` button).
5. In **Live draw**, choose prize, visual mode and winner count, tick the confirmation, and start. Winners are now fixed in the database but not yet visible publicly.
6. Reveal automatically on the configured cadence, or use **Reveal next**. Pause/resume at any time; a browser refresh resumes from the persisted reveal index.
7. Click **Complete draw** to finalize the batch and update prize quantities.
8. If necessary, void a completed result with a reason and choose whether those Employee IDs stay ineligible (default) or are explicitly restored with an audited exception.
9. Export winners from **Winners & audit**.

## Deployment

Hosted deployment is **not enabled in this repository**. Deployment requires your explicit approval and credentials. Recommended setup: Supabase Pro + Vercel Pro (commercial use). Vercel Hobby is not licensed for commercial use. See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for the full checklist and [`docs/RUNBOOK.md`](docs/RUNBOOK.md) for event-day procedures.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Next.js development server |
| `npm run build` / `npm start` | Production build / standalone server |
| `npm run typecheck` | Strict TypeScript check |
| `npm test` | Vitest unit tests (no database required) |
| `npm run test:e2e` | Playwright smoke tests (requires seeded local stack) |
| `npm run db:start` / `db:stop` / `db:reset` | Supabase local lifecycle |

## Documentation

- [Assessment](docs/ASSESSMENT.md) — requirements and risk decisions
- [Architecture](docs/ARCHITECTURE.md) — trust boundaries and contracts
- [Database](docs/DATABASE.md) — schema, constraints, RLS and RPCs
- [Testing](docs/TESTING.md) — unit, E2E and SQL invariant checks
- [Deployment](docs/DEPLOYMENT.md) — Supabase + Vercel checklist
- [Runbook](docs/RUNBOOK.md) — event-day operations and recovery
- [Third-party notices](THIRD_PARTY_NOTICES.md) — licences and attributions

## Security note

Never put `SUPABASE_SERVICE_ROLE_KEY` in a `NEXT_PUBLIC_*` variable or import a server-only module into a client component. The projector capability link is a secret, not authentication; rotate it if it leaks. Audit logs are append-only and voided winners are never deleted.
