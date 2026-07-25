# AGENTS.md

Guidance for AI coding agents working in this repo. GreptimeDB Dashboard is a data-visualization platform for GreptimeDB.

## Commands

Package manager is **pnpm** (`pnpm@9.12.1`, do not use npm/yarn). Node >= 14.

| Task | Command |
|------|---------|
| Install | `pnpm install` |
| Dev server | `pnpm run dev` (port 5177, strict) |
| Dev (cloud role) | `pnpm run cloud` |
| Production build | `pnpm run build` |
| Docker build | `pnpm run build:docker` |
| Type check only | `pnpm run type:check` (`vue-tsc --noEmit --skipLibCheck`) |
| Tests | `pnpm test` (`vitest run`) |
| Preview prod build | `pnpm run preview` (port 5178) |
| Simulate CI build | `make test-ci-build` |

**Dev prerequisite:** a GreptimeDB instance must be running on `localhost:4000` — the Vite dev server proxies `/v1` and `/status` there. Start one with `./greptime standalone start`.

**Build vs typecheck:** `pnpm run build` does **not** run `vue-tsc`. Only `build:test` and `build:staging` append `vue-tsc --noEmit`. Run `pnpm run type:check` separately to catch type errors.

## Architecture: two apps in one repo

This repo builds **two separate HTML entry points** from a single Vite project. This is the most important non-obvious fact:

1. **Vue app** — `index.html` → `src/main.ts`. The main dashboard UI (query, metrics, logs, traces, ingestion, flow, status). Vue 3 + Arco Design + Pinia + Vue Router.
2. **React app** — `dashboard.html` → `src/dashboard-main.tsx`. Perses-powered dashboard visualization. React 18 + MUI + Perses plugin system.

The Vue app embeds the React app via an **iframe** (`src/perses-dashboard/vue/PersesDashboardIframe.vue` loads `dashboard.html`) and they communicate through `window.postMessage` (message types: `update-dashboard`, `dashboard-iframe-ready`, `save-dashboard-request/response`, `create-snapshot-request/response`).

Directory ownership:
- `src/` — Vue app (main). `src/views/dashboard/` holds feature pages: `query`, `metrics`, `logs`, `traces`, `ingest`, `flow`, `perses`, `status`, `playground`.
- `src/perses-dashboard/react/` — React Perses app (DashboardContainer, WorkbenchProvider, SnapshotBridge, plugin, theme).
- `src/perses-dashboard/vue/` — Vue-side iframe wrapper.
- `src/perses-dashboard/vendor/` — vendored React deps (`hoist-non-react-statics`, `react-is`) aliased in Vite config.
- `src-tauri/` — Tauri v2 desktop wrapper (Rust). `beforeDevCommand: pnpm dev`, `beforeBuildCommand: pnpm build`, `devUrl: http://localhost:5177`.
- `config/` — Vite configs (`base`, `dev`, `prod`) and build plugins.
- `skills/` — ships the `greptimedb-perses-dashboard` agent skill (see `skills/README.md`).

## Auto-imports (critical gotcha)

`unplugin-auto-import` and `unplugin-vue-components` are configured in `config/vite.config.base.ts`:

- **Auto-imported in Vue files:** `vue`, `pinia`, `vue-router` APIs plus everything exported from `src/store` and `src/hooks`. You do **not** need to import `ref`, `computed`, `useAppStore`, etc.
- **Auto-registered components:** anything in `src/components` and `src/views` is globally available, no import needed.
- **Excluded from auto-import:** `src/perses-dashboard/react/**` and `src/dashboard-main.tsx`. In the React side you **must** write explicit imports.
- Generated declaration files (`auto-imports.d.ts`, `components.d.ts`, `.eslintrc-auto-import.json`) are **gitignored** — regenerated on dev/build. Do not commit or hand-edit them.

## Path aliases

Defined in `config/vite.config.base.ts` and `tsconfig.json`:

- `@` → `src/`
- `assets` → `src/assets`
- `vue` → `vue/dist/vue.esm-bundler.js` (runtime template compilation, required for Arco)
- `vue-i18n` → CJS build (avoids i18n warning)
- `hoist-non-react-statics`, `react-is` → vendored copies in `src/perses-dashboard/vendor/`

## TypeScript

`tsconfig.json` is intentionally relaxed: `strictNullChecks: false`, `noImplicitAny: false`, `noUnusedLocals: false`. Do not "tighten" these without team discussion — existing code relies on the loose settings. Type checking uses `vue-tsc` (v1.0.19), not plain `tsc`.

## Styling

- **Less** (not SCSS). Arco Design theme is customized via Less `modifyVars` in `config/vite.config.base.ts` referencing `src/assets/style/breakpoint.less` and `arco-theme.less`.
- Vue SFCs use **Pug** templates (`lang="pug"`). Prettier has a pug plugin with specific attribute sort order (see `.prettierrc.js`) — let prettier handle pug formatting.
- Stylelint covers less + vue + stylus; `defaultSeverity: 'warning'`.

## Code style

- Prettier: no semicolons, single quotes, 2-space indent, 120 print width.
- ESLint: airbnb-base + `@typescript-eslint/recommended` + `vue/vue3-recommended` + prettier. `no-explicit-any` and `no-unused-vars` are **off** — `any` is allowed.
- Import extensions are not required for js/ts/tsx/jsx.

## Git hooks (husky)

- **pre-commit:** runs `lint-staged` → `prettier --write` on staged `.{js,ts,jsx,tsx,vue,less,css}` files.
- **commit-msg:** runs `commitlint` enforcing [conventional commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `style:`, `refactor:`, etc.). Non-conforming messages are rejected.

## Environment & roles

Env files: `.env.development`, `.env.production`, `.env.staging`, `.env.test`.

- `VITE_ROLE` — `admin` (self-hosted GreptimeDB) vs `cloud` (GreptimeCloud). Controls which routes/features are available (route `meta.roles`).
- `VITE_API_BASE_URL` — GreptimeCloud API endpoint.
- `VITE_CLOUD_URL` — GreptimeCloud console frontend URL.
- Tauri build sets `TAURI_PLATFORM` / `TAURI_DEBUG`, which change the Vite build target and minify/sourcemap behavior (see `config/vite.config.prod.ts`).

## Codemirror version pinning

Several `@codemirror/*`, `@lezer/*`, and `@prometheus-io/codemirror-promql` packages are pinned via `resolutions` in `package.json` to keep them in sync. Do not bump one without updating the others — mismatched Codemirror versions cause runtime crashes.

## Things to avoid

- `ai-sql-service/` is **gitignored** — an external directory, do not modify or commit anything there.
- `dist/` is a build artifact — never commit.
- `.cursor/skills` is gitignored (skills are copied there locally per `skills/README.md`).
- There are currently **no test files** in `src/`. `pnpm test` runs but has nothing to execute. If adding tests, use Vitest colocated `*.test.ts` files.
