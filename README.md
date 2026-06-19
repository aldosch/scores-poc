# scores-poc

Near-realtime sports scores without realtime infrastructure, built as a
[Turborepo](https://turborepo.dev) monorepo with [pnpm](https://pnpm.io).

## What this demonstrates

Live-ish scores at high concurrency using only Next.js App Router primitives, no
WebSockets, SSE, or persistent connections:

- **`back`** is dynamic and fetches from the third-party scores provider. It
  serves JSON and has no users of its own.
- **`front`** caches the scores page with ISR (`revalidate = 5`), so the
  provider is hit at most once per revalidation window per edge region, never
  per viewer.
- The client calls `router.refresh()` on an **adaptive interval** to pick up new
  ISR generations. It re-fetches the RSC payload (not a full reload) and React
  reconciles only the changed values, so there's no layout shift.
- Polling slows from 5s to 60s when no games are live or the user is idle, stops
  while the tab is hidden, and resumes immediately on return.

The running `front` app explains the architecture in detail on its homepage; the
notes below focus on the code and how to run it.

## Apps

| App                        | Role                                                    | Dev port |
| -------------------------- | ------------------------------------------------------- | -------- |
| [`apps/front`](apps/front) | Public app. ISR-cached scores page + adaptive poller.   | 3000     |
| [`apps/back`](apps/back)   | Internal API. Dynamic `/api/scores`, no caching.        | 3001     |

Both use Next.js 16, React 19, Tailwind v4 + shadcn/ui (base-nova), and
[Biome](https://biomejs.dev) for lint/format.

## Getting started

```sh
pnpm install

# Both apps read a shared secret from .env.local (already present for local dev):
#   apps/back/.env.local   -> BACK_API_SECRET
#   apps/front/.env.local  -> BACK_URL=http://localhost:3001, BACK_API_SECRET

pnpm dev          # front:3000, back:3001
```

Open http://localhost:3000. `back` must be running for `front` to fetch scores;
if it isn't, the board degrades to an empty state and retries on the next
revalidation window.

## How the pieces fit together

```
apps/back/src/app/api/scores/route.ts   force-dynamic; returns { scores, hasLiveGames }
                │  (server-side fetch with x-api-secret header)
                ▼
apps/front/src/lib/scores.ts             getScoresSafe(): fetch with next:{revalidate:5}
                │
                ▼
apps/front/src/app/page.tsx              ISR page (revalidate = 5)
                │
                ├── components/scores-poller.tsx     adaptive router.refresh() loop
                ├── components/live-game-card.tsx    one game, animated scores
                ├── components/poll-monitor.tsx      event bus: poller -> visualiser
                ├── components/poll-visualiser.tsx   countdown + stats + activity log
                └── components/architecture.tsx      the "how it's built" breakdown
```

The core polling logic lives entirely in `scores-poller.tsx` and is kept
deliberately small. It emits observability events to `poll-monitor.tsx`; strip
those calls and the poller still works. The visualiser only reads that state and
never influences polling.

### Key files

| File                                          | What it does                                                        |
| --------------------------------------------- | ------------------------------------------------------------------- |
| `apps/back/.../api/scores/route.ts`           | Dynamic mock provider; computes `hasLiveGames`.                     |
| `apps/front/src/lib/scores.ts`                | Server-only fetch helper; sends the secret, participates in ISR.    |
| `apps/front/src/components/scores-poller.tsx` | Adaptive `setTimeout` loop with jitter, idle + visibility handling. |
| `apps/front/src/components/poll-monitor.tsx`  | Client context the poller emits to and the visualiser subscribes.   |

## Scripts

Run from the repo root, orchestrated by Turborepo:

| Command            | Description                                    |
| ------------------ | ---------------------------------------------- |
| `pnpm dev`         | Start every app's dev server                   |
| `pnpm build`       | Build every app (cached)                       |
| `pnpm start`       | Build then start every app in production mode  |
| `pnpm lint`        | Lint every app with Biome                      |
| `pnpm format`      | Format every app with Biome                    |
| `pnpm check-types` | Type-check every app with `tsc`                |

Target a single app with a filter, e.g. `pnpm dev --filter=back`.

## Structure

```
scores-poc/
├── apps/
│   ├── front/  # public app: ISR page, poller, demo UI
│   └── back/   # internal API: dynamic /api/scores
├── biome.json  # shared Biome config (apps extend via "extends": "//")
├── turbo.json  # Turborepo task pipeline
└── pnpm-workspace.yaml
```

The `Score` / `ScoresResponse` types are currently duplicated and kept in sync
between the two apps. They can move to a shared `packages/*` workspace if more
apps need them.
