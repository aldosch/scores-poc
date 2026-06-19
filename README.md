# scores-poc

A minimal [Turborepo](https://turborepo.dev) monorepo managed with [pnpm](https://pnpm.io).

## Apps

| App                | Description                                                        | Dev port |
| ------------------ | ------------------------------------------------------------------ | -------- |
| [`apps/front`](apps/front) | Next.js front-end. Consumes the API served by `back`.          | 3000     |
| [`apps/back`](apps/back)   | Next.js API back-end. Serves API routes for `front` and future apps. | 3001     |

Both apps use Next.js 16, React 19, and [Biome](https://biomejs.dev) for lint/format.

## Getting started

```sh
pnpm install
pnpm dev          # run all apps in dev (front:3000, back:3001)
```

## Scripts

All scripts are run from the repo root and orchestrated by Turborepo:

| Command            | Description                                  |
| ------------------ | -------------------------------------------- |
| `pnpm dev`         | Start every app's dev server                 |
| `pnpm build`       | Build every app (cached)                     |
| `pnpm start`       | Build then start every app in production mode |
| `pnpm lint`        | Lint every app with Biome                    |
| `pnpm format`      | Format every app with Biome                  |
| `pnpm check-types` | Type-check every app with `tsc`              |

Target a single app with a filter, e.g. `pnpm dev --filter=back`.

## Structure

```
scores-poc/
├── apps/
│   ├── front/  # Next.js front-end
│   └── back/   # Next.js API back-end
├── biome.json  # Shared Biome config (apps extend via "extends": "//")
├── turbo.json  # Turborepo task pipeline
└── pnpm-workspace.yaml
```

Shared code can be added later under `packages/` and imported as workspace
dependencies (e.g. `@scores-poc/*`).
