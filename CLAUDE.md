# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

testPlatform is a testing platform that integrates with the ADPRO ERP system, providing three testing paradigms: API tests, UI component tests (Playwright), and E2E tests (Playwright codegen). It is a monorepo with a Node.js/Express backend and a React frontend.

## Commands

### Backend (`/backend`)
```powershell
npm run dev      # Start dev server with hot reload (ts-node-dev)
npm run build    # Compile TypeScript to dist/
npm start        # Build then run from dist/app.js
```

### Frontend (`/frontend`)
```powershell
npm run dev      # Start Vite dev server on port 5173
npm run build    # tsc + vite build → outputs to ../backend/public
npm run lint     # ESLint (flat config, typescript-eslint)
npm run preview  # Preview the production build
```

### Running Full Stack Locally
Start both independently. Vite proxies `/api/*` → `http://localhost:3600` in dev, and the backend serves the built frontend from `backend/public` in production.

## Architecture

### Backend (`backend/src/`)
Follows a layered pattern: **routes → controllers → services**.

- **`app.ts`** — entry point, mounts Express app
- **`presentation/server.ts`** — HTTP server setup
- **`presentation/routes.ts`** — all route registrations; public routes skip auth middleware, protected routes require session
- **`presentation/controllers/`** — thin controllers that call services and return HTTP responses
- **`services/`** — business logic; each domain (apiTest, uiTest, e2e, module, auth) has its own service
- **`middleware/session.middleware.ts`** — session authentication guard for protected routes
- **`config/envs.ts`** — centralizes all `process.env` reads

### Frontend (`frontend/src/`)
- **`pages/`** — `LoginPage` (ADPRO empresa/sucursal login), `PlatformPage` (main testing UI with tabs)
- **`components/testing/`** — tab components: `ApiTestTab`, `UiTestTab`, `E2eTab`, `ModuleOverview`, `SwaggerBrowser`
- **`store/`** — Zustand stores: `useSessionStore` (auth state, empresa/sucursal), `useModuleStore` (selected module/submodule/page)
- **`api/client.ts`** — Axios instance; all API calls go through here
- **`types/platform.ts`** — shared TypeScript types

### Data Storage
Tests and specs are stored as JSON files in the **`backend/workspace/`** directory. The path pattern is:
```
workspace/modules/{moduleName}/{submoduleName?}/{pageName?}/
  api/tests.json
  ui/tests.json
  e2e/recordings.json
```
`ModuleService` handles all filesystem operations for this structure.

### ADPRO Integration
- **`adpro-auth.service.ts`** — authenticates against the ADPRO ERP, fetches empresas/sucursales, and stores the session token
- The session token is auto-injected into API test requests and Playwright browser contexts for UI/E2E tests
- `playwright-auth.service.ts` handles Playwright session bootstrap using the ADPRO token

### Environment Variables (`backend/.env`)
| Variable | Purpose |
|---|---|
| `PORT` | Backend HTTP port (default 3600) |
| `SESSION_SECRET` | express-session secret |
| `ANTHROPIC_API_KEY` | Claude AI SDK key |
| `WORKSPACE_PATH` | Path to workspace dir (default `./workspace`) |
| `NOM_USUARIO` / `CLAVE_USUARIO` | Default ADPRO credentials |

## Key Decisions

- **File-based storage** — no database; all test definitions live as JSON in `workspace/`. This means the workspace directory is the source of truth.
- **Frontend build target** — Vite builds directly into `backend/public/`, so the Express server serves the SPA in production with no separate static server.
- **Playwright for UI/E2E** — browser automation runs inside the backend process. `E2eService` manages live Playwright codegen processes and tracks them by session ID.
- **`@anthropic-ai/sdk`** is installed in the backend for AI-assisted features.
