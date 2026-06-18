# Split Ledger

Split Ledger keeps track of shared expenses in a group: a trip, a shared flat, a regular dinner. Everyone adds what they paid, the app works out who owes whom, and when it is time to settle up it suggests the smallest number of payments that clears every debt.

**Live demo: [split-ledger-murex.vercel.app](https://split-ledger-murex.vercel.app)**. Press "Try the demo" to sign in as Alex, who already has three groups of sample expenses. The demo keeps its data in memory and resets now and then, so feel free to experiment.

![The Lisbon trip group: expenses on the left, balances and the settle-up plan on the right](docs/screenshot.png)

## What it does

- **Groups and invite links.** Create a group with a main currency, then share a link that lets people join for seven days.
- **Four ways to split a bill.** Equally, by exact amounts, by percentages or by shares (two shares for the person who had a double portion). The form shows each person's share live and says how much is still unassigned.
- **Several currencies, never mixed.** A trip can have expenses in euros and dollars. Each currency keeps its own balances and its own settle-up plan; nothing is converted behind your back.
- **Exact money.** Amounts are stored as whole numbers of cents (or yen, or fils), and leftover cents from a split are handed out by a documented rule, so a bill always adds up to exactly what was paid.
- **Settle up in the fewest payments.** See the section below.
- **Activity log** of who added, changed or deleted what, and who paid whom.
- **CSV export** of every expense and payment, with each member's share in its own column.
- **Accounts** with hashed passwords and an httpOnly session cookie. People only ever see groups they belong to.

## How it is built

An npm workspaces monorepo with three packages. The shared package holds the rules, so the browser and the server run literally the same code for money, splits and settling up, and the request and response types are the same on both ends.

```
split-ledger/
├── packages/shared   Zod schemas (the API contract), money parsing and formatting,
│                     split allocation, balances, the settle-up planner
├── apps/api          Fastify 5 JSON API, Drizzle ORM, Postgres or in-memory PGlite
└── apps/web          Vite + React 19, React Router 7, TanStack Query, CSS Modules

        apps/web ──imports──▶ packages/shared ◀──imports── apps/api
           │                                                  │
           └──────────── fetch /api/*  (JSON + cookie) ──────▶│
```

| Layer | Choices |
| --- | --- |
| Web | React 19, React Router 7, TanStack Query 5, CSS Modules, Vite 8 |
| API | Fastify 5, Zod 4 validation from the shared schemas, scrypt password hashing |
| Data | Drizzle ORM with SQL migrations; Postgres in production, PGlite (Postgres compiled to WebAssembly) when `DATABASE_URL` is not set |
| Tests | Vitest with fast-check property tests, API integration tests on PGlite and on Postgres 17, Playwright end-to-end tests with axe accessibility scans |
| Delivery | GitHub Actions, a Docker image with Compose, Vercel |

### Authentication and authorization

- Passwords are hashed with scrypt from `node:crypto`. Login takes the same time whether or not the email exists.
- With a real database, the session cookie holds 32 random bytes and the `sessions` table stores only their SHA-256, so logging out revokes the session and a database leak cannot be replayed as cookies.
- In the public demo every serverless instance has its own in-memory database, so a session row written by one instance would be unknown to the next. Demo cookies are therefore HMAC-signed tokens (`user id + expiry + signature`) that any instance can verify with the shared `SESSION_SECRET`, and the demo data is seeded with fixed ids so a group URL means the same thing everywhere. Each mode refuses the other's tokens.
- The cookie is `HttpOnly` and `SameSite=Lax`. The API accepts only JSON bodies (a cross-site HTML form cannot send one without a preflight) and refuses unsafe requests whose `Origin` is another site.
- Every group route checks membership first. Outsiders get the same 404 as a group that does not exist, and the test suite walks every group-scoped route as an outsider to prove it.

## The settle-up algorithm

After all expenses and payments, each person has a net balance per currency: positive if the group owes them, negative if they owe the group. The balances always sum to zero. The goal is a list of payments that brings everyone to zero with as few payments as possible.

**Greedy pass.** Repeatedly take the person owed the most and the person who owes the most, and have one pay the other the smaller of the two amounts. Each payment clears at least one person and the last one clears two, so `n` people with a non-zero balance never need more than `n - 1` payments. This runs in O(n²) and handles any group size.

**Exact pass.** Greedy is not always optimal. Finding the true minimum is NP-hard in general, but it has a useful structure: if the people can be split into `k` separate groups whose balances each sum to zero, each group can settle internally with `size - 1` payments, so the minimum is `n - k`, where `k` is the largest such split. A dynamic program over subsets of people finds that `k` in O(2ⁿ · n), which is instant for up to 16 people with a non-zero balance. Inside each zero-sum group the greedy pass then produces the payments.

```
balances:  Alice +4  Ben +6  Chen +5  Dana +6  Eli -1  Farah -6  Gus -14

greedy:    6 payments
exact:     5 payments   (Farah -6 and Ben +6 cancel out, so they settle as a pair)
```

`settleUp` uses the exact pass for up to 16 people and falls back to greedy for larger groups. Both are covered by property tests with fast-check: for thousands of random balance sets, following the plan leaves everyone at exactly zero, money only flows from people who owe to people who are owed, greedy stays within `n - 1` payments, the exact pass is never worse than greedy, and on small inputs it matches a brute-force search for the true minimum.

Splitting a bill uses the largest remainder method: each person gets the whole-cent floor of their exact share, and the leftover cents go to the people with the largest remainders (ties to the earlier person). Property tests check that splits always add up to the bill and that nobody is ever more than one cent away from their exact share.

## Running it locally

Requires Node 22.

```bash
npm ci
npm run dev:api     # API on http://localhost:47311, in-memory demo data
npm run dev:web     # web app on http://localhost:47310, proxies /api to the API
```

Without `DATABASE_URL` the API starts in demo mode on an in-memory PGlite database with sample data, and the sign-in page shows the "Try the demo" button. To use Postgres:

```bash
DATABASE_URL=postgres://user:pass@localhost:5432/split_ledger npm run dev:api
```

Migrations run on start. After changing `apps/api/src/db/schema.ts`, generate a new migration with `npm run db:generate --workspace @split-ledger/api`.

Or run the production image against Postgres 17:

```bash
docker compose up --build    # http://localhost:3000
```

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string. Unset means in-memory PGlite and demo mode. |
| `SESSION_SECRET` | 32+ character key for signed demo sessions. Set it on any multi-instance demo deployment. |
| `DEMO_MODE` | `1` or `0` to force demo mode on or off. |
| `SECURE_COOKIES` | `1` or `0`; defaults to on when `NODE_ENV=production`. |
| `PORT`, `HOST`, `WEB_ROOT` | Where the server listens and, optionally, a built web app to serve. |

## Testing

```bash
npm test             # Vitest: shared logic, API integration (PGlite), web form logic
npm run test:e2e     # Playwright against the production build, with axe scans
npm run lint
npm run typecheck
```

- `packages/shared`: unit and property tests for money parsing, split allocation, balances and both settle-up strategies, including a comparison with a brute-force optimum.
- `apps/api`: integration tests through Fastify's `inject`, each test file on its own fresh database. They cover registration and login, cookie flags, CSRF defences, every split method, editing and deleting, balances across currencies, recording payments, the activity log, CSV output (including formula injection), invite links, signed demo sessions shared between two "instances", and an authorization suite that tries every group route as an outsider.
- Set `TEST_DATABASE_URL` to run the API suite against a real Postgres server; each test file creates and drops its own database. CI does this on a Postgres 17 service.
- `e2e`: two browsers share a group through an invite link, add a bill split by shares, settle up and download the CSV; plus the demo flow, multi-currency ledgers, editing, validation messages, authorization and sign-out. Pages are scanned with axe for WCAG 2.1 AA issues. Set `BASE_URL` to run the suite against a deployment.

CI runs lint, typecheck, the unit suite on PGlite, the build and `npm audit`; the API suite again on Postgres 17; then the Playwright suite and a Docker Compose smoke test.

## Deployment notes

The live site runs on Vercel with no database, which is what puts it in demo mode. `scripts/build-vercel.mjs` writes Vercel's Build Output API format directly:

- the Vite build is served as static files from the CDN, with every other path falling back to `index.html` for client-side routes;
- the whole API is bundled by esbuild into **one** Node function that handles every `/api/*` route, together with the SQL migrations and PGlite's WebAssembly files. One function means one warm instance serves all API calls, so the in-memory demo stays consistent between requests;
- `SESSION_SECRET` is set as an encrypted environment variable, so when Vercel does start a second instance, existing demo sessions still work there.
- A burst of parallel requests can still make Vercel start a second instance, which has never seen an account registered on the first. While the server reports demo mode, the web client therefore sends API requests one at a time, which keeps a visitor on the same warm instance. With a real database this queue is switched off.

The demo is honest about its limits: the sample account works on every instance, but anything you add lives only in the instance that served it and disappears when that instance is recycled.

For a persistent deployment, set `DATABASE_URL` (for example a Neon or Supabase Postgres). Demo mode then switches off, sessions move to the database, and the "Try the demo" button disappears.

## License

MIT, see [LICENSE](LICENSE).
