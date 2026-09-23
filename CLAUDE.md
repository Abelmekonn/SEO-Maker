# CLAUDE.md

SEO Maker — a Next.js dashboard plus a background worker that crawls sites, audits SEO,
runs PageSpeed, and compares a project against its search competitors.

## Layout

```
apps/web       Next.js 15 App Router + React 19 (Turbopack), Clerk auth, Tailwind v4
apps/worker    BullMQ worker, run with tsx (no build step)
packages/core  @seo-maker/core — shared pure TS: scoring, SSRF rules, queue names, competitors
packages/db    @seo-maker/db — Prisma client + schema + raw-SQL progress helpers
```

`packages/core` and `packages/db` are **raw TypeScript with no build step**, consumed
directly through subpath exports. Two consequences that break things when forgotten:

- A new subpath must be added to the `exports` map in that package's `package.json`.
- `apps/web/next.config.ts` lists both in `transpilePackages`. Any new shared package
  must be added there or Next fails on unparsed TS.

`packages/core/package.json` declares `./ai` and `./serp` exports whose directories do not
exist yet. Importing them fails.

## Commands

```bash
pnpm db:up          # docker compose --wait (Postgres :5433, Redis :6380 — not the defaults)
pnpm db:migrate     # prisma migrate dev  (INTERACTIVE — see below)
pnpm db:deploy      # db:up + prisma migrate deploy
pnpm db:generate    # regenerate the Prisma client
pnpm dev            # turbo run dev — web + worker together
pnpm build          # also the de-facto typecheck for apps/web
pnpm test           # vitest, packages/core only
pnpm lint           # eslint, apps/web only
```

`prisma migrate dev` prompts, so it fails in a non-interactive shell. The working path is
`prisma migrate diff --from-schema-datasource --to-schema-datamodel --script`, review the
SQL, write the migration file by hand, then `prisma migrate deploy`.

Read migration SQL for `DROP` / `TRUNCATE` / `SET NOT NULL` before applying — this database
holds real crawl data.

On Windows, `db:generate` fails with `EPERM` on `query_engine-windows.dll.node` while the
worker's `tsx watch` is running. Stop the worker first rather than killing processes blindly.

**Editing `packages/core` while `next dev` is running leaves Turbopack holding a stale copy.**
The workspace packages are transpiled into the app's module graph, and the watcher does not
reliably pick up changes inside them. The symptom is a runtime `X is not a function` for a
newly added export while `tsc --noEmit` is clean. Restart the dev server.

## Environment

Four separate env files, each read by a different consumer:

| File | Read by |
|---|---|
| `.env` (root) | scripts run from the repo root |
| `apps/web/.env.local` | Next.js |
| `apps/worker/.env` | the worker, via `tsx --env-file=.env` |
| `packages/db/.env` | the Prisma CLI |

`.env.example` documents Clerk, `DATABASE_URL`, `REDIS_URL`, `PAGESPEED_API_KEY`.
It does **not** yet list `DATAFORSEO_LOGIN` / `DATAFORSEO_PASSWORD`, which
`lib/competitors.ts → serpConfigured()` reads. Never prefix a secret with `NEXT_PUBLIC_`.

## Queues and jobs

Two BullMQ queues, both served by the single `apps/worker` process, dispatching on
`job.name` inside one `Worker` callback. `concurrency: 1` each.

Queue and job-name constants live in `packages/core/src/queue/names.ts` and are imported by
both sides. Do not redeclare them — duplicated constants were a real bug here.

Competitor discovery is enqueued with `attempts: 1` on purpose: it is long, side-effectful
and spends SERP/AI credits, so a silent retry would double-bill. Retries belong inside phases.

`apps/worker` has **no path aliases**; use relative imports.

## Progress and polling

Job progress is written to **columns on `Project`** (`perfStatus`/`perfDone`/`perfTotal`,
`compStatus`/`compPhase`/…), not `job.updateProgress` and not SSE. The client polls with
`components/project/CrawlRefresh.tsx` calling `router.refresh()`.

The helpers in `packages/db/src/*-progress.ts` use `$queryRawUnsafe`/`$executeRawUnsafe`
deliberately — they must keep working against a stale generated client. Increments are
atomic (`SET x = x + 1`). Match that style when adding more.

## API routes

Under `apps/web/app/api/projects/…`, which `middleware.ts` protects via `/api/projects(.*)`.
Use `app/api/projects/[id]/performance/route.ts` as the template.

- **There are no GET routes.** Server components read Prisma directly; mutations are
  POST/PATCH/DELETE followed by `router.refresh()`.
- `await params` (Next 15), then `requireUserId()` → 401.
- Ownership is always a `where` filter (`project: { userId }`) → 404 when it misses.
  Never trust a `projectId`/`competitorId` from the client without it.
- Errors are `{ error: "Sentence-cased with a period." }`.
- Status vocabulary: 400 · 401 · 403 (plan gating) · 404 · 409 (already running) · 503 (queue down).

## Outbound requests

Anything that fetches a **user-supplied URL** must go through
`assertSafeUrl` / `safeFetch` from `@seo-maker/core/net`. The rules in `net/ip-rules.ts`
block loopback, RFC1918, CGNAT, link-local including `169.254.169.254`, cloud metadata
hostnames, and unwrap IPv4-mapped (`::ffff:`) and 6to4 (`2002::`) addresses.

The competitor crawler layers three guards because Crawlee uses `got-scraping`, not `fetch`:
`assertSafeUrl` in `preNavigationHooks`, `gotOptions.dnsLookup = guardedLookup` (the
DNS-rebinding defense, checked at connect time), and per-redirect revalidation. It also
enforces robots.txt `Disallow`.

Rejection messages stay generic ("That domain cannot be analyzed.") so they cannot be used
to probe which internal hosts exist.

## Scoring rules

Three 0–100 scores that must never be merged, averaged, or given the same label:

| Score | Question | Bands |
|---|---|---|
| Competitor Confidence | How strongly does this domain compete with us in search? | primary / secondary / peripheral / unrelated |
| SEO Score | How healthy is this site on measurable signals? | excellent / good / fair / poor |
| Opportunity Score | How valuable is fixing this gap? | critical / high / medium / low |

The band vocabularies are deliberately non-overlapping. Always label with the noun
("Confidence 82", "SEO 61").

**Never score an unmeasured dimension 0.** `packages/core/src/scoring/weights.ts →
redistribute()` drops null measurements and renormalizes the remaining weights to 100;
when nothing is measured it returns `null`. Confidence additionally returns `null` unless
at least one *search-evidence* signal exists, so a manually added competitor with no SERP
data cannot show a fabricated 100. The UI renders "Not measured" / "Not enough data".

**No fake data in production code** — no placeholder competitors, SERP results, search
volumes or metrics. Mocks belong in tests only.

## UI conventions

Tailwind v4 with no config file; tokens are declared in `@theme inline` in
`apps/web/app/globals.css`. The dashboard's dark theme is scoped to `.dash-root`
(brand orange `#ff6d29` on near-black) — marketing pages use the `mkt-*` tokens.

Recurring classes: sections `rounded-xl bg-surface-soft p-5 ring-1 ring-hairline`; nested
cards `rounded-lg bg-canvas p-4 ring-1 ring-hairline`; badges `bg-{good|warn|bad}/15
text-{...}`; numbers `font-mono tabular-nums`.

Reuse rather than rebuild: `OverviewCharts.tsx` (SemiGauge, HBarList, DonutChart,
TrendLines), `ScoreRing.tsx`, `StatusBadge.tsx`, `shell.tsx` (Panel, PageHeader, StatTile),
`pageNumbers()` in `PageAuditTable.tsx`, `Tabs` from `radix-ui`.

`TrendLines` has a fixed 0–100 domain — normalize before passing raw counts in.

## Tests

Vitest runs in `packages/core` only, colocated as `src/**/*.test.ts`, `environment: "node"`,
no DB and no network. Pure functions belong there; that is what makes them testable.
Do not snapshot-test AI prose.
