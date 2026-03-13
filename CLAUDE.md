# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Start everything (from root)

```bash
npm run dev          # Runs backend (port 5000) + frontend (port 3000) concurrently
npm run server       # Backend only
npm run client       # Frontend only
npm run install-all  # Install all dependencies (root + backend + frontend)
```

### Backend (run from `backend/`)

```bash
npm run dev          # nodemon with NODE_ENV=development
npm test             # Jest tests
npm run test:watch   # Watch mode
npm run test:coverage
npm run test:unit    # Only unit tests
npm run test:integration
cd backend && node scripts/createAdmin.js   # Seed initial admin + user + base data
```

### Frontend (run from `frontend/`)

```bash
npm start            # Dev server on port 3000
npm run build        # Production build
npm test             # React testing library tests
# Note: use --legacy-peer-deps on fresh installs
```

### Lint & Format (from root or subdirectory)

```bash
npm run lint         # ESLint both frontend and backend
npm run lint:fix     # Auto-fix lint errors
npm run format       # Prettier format both
```

Husky pre-commit hook runs lint-staged (ESLint + Prettier) on changed files automatically.

## Architecture Overview

### Monorepo structure

```
helpDesk/
├── backend/     Node.js + Express API server
├── frontend/    React 19 + TypeScript SPA
└── package.json Root scripts via concurrently
```

### Backend (`backend/`)

**Entry point:** `app.js` — connects MongoDB, initializes Socket.IO, starts all background jobs, then registers Express routes and middleware.

**Request flow:**
`app.js` → `middleware/` (cors, security, rate-limits, auth) → `routes/` → `controllers/` → `models/` (Mongoose)

**Key patterns:**

- All API responses use the standard shape from `utils/response.js`: `{ success, data, message }`
- Auth is JWT Bearer via `middleware/auth.js` (`authenticateToken`). Admin-only routes use `middleware/adminAuth.js`
- Three user roles: `user`, `admin`, `super_admin`. The helper `isAdminRole()` checks both admin and super_admin
- Socket.IO instance is stored on `app.set('io', io)` and retrieved with `req.app.get('io')` in controllers for real-time events
- Background jobs in `jobs/` use `node-cron` and are initialized in `app.js` after MongoDB connects
- Redis caching is optional; `services/cacheService.js` gracefully degrades if Redis is unavailable
- File uploads land in `backend/uploads/` (served statically at `/uploads`)
- Logs in `backend/logs/` (Winston daily-rotate + audit logs)

**AI integration:** Supports Groq (`groq-sdk`) and OpenAI (`openai`) via `AI_PROVIDER` env var. Logic lives in `services/aiFirstLineService.js`, `services/aiEnhancedService.js`. AI feedback and knowledge base in `controllers/aiFeedbackController.js`, `controllers/aiKnowledgeController.js`.

**Telegram bot:** `services/telegramService.js` + `services/telegramServiceInstance.js` (singleton). Bot flows: registration, ticket creation, notifications. AI responses handled in `services/telegramAIService.js`.

**Zabbix integration:** `services/zabbixService.js` + polling job `jobs/zabbixPolling.js`.

### Frontend (`frontend/src/`)

**Entry point:** `App.tsx` — sets up providers and React Router routes.

**Provider stack (outermost → innermost):**
`ThemeProvider` → `AuthProvider` → `PendingRegistrationsProvider` → `Router`

**Auth:** `contexts/AuthContext.tsx` stores JWT in `localStorage`. The `ProtectedRoute` component guards routes; `requiredRole` prop restricts to admin/super_admin. Routing splits on role: `/dashboard` for users, `/admin/dashboard` for admins.

**API layer:** Single `ApiService` class in `services/api.ts` wraps axios. All requests go to `/api` (proxied to `localhost:5000` in dev via `setupProxy.js`). Token auto-injected in request interceptor; 401 triggers logout.

**Real-time:** Socket.IO client initialized in `services/logService.ts`. Components subscribe via `components/SocketNotifications.tsx`.

**Styling:** Tailwind CSS + MUI components. Theme toggled via `ThemeContext`.

**i18n:** `i18next` with Ukrainian (`uk`) and English (`en`) locales in `src/i18n/`.

**Types:** All shared TypeScript types in `src/types/index.ts`. Key enums: `UserRole`, `TicketStatus`, `TicketPriority`.

## Environment Setup

Copy `backend/.env.example` to `backend/.env` and set at minimum:

- `MONGODB_URI` — defaults to `mongodb://localhost:27017/helpdesk`
- `JWT_SECRET` and `JWT_REFRESH_SECRET` — min 32 chars
- `FRONTEND_URL` — for CORS (default `http://localhost:3000`)

Frontend dev proxy (`setupProxy.js`) automatically forwards `/api` → `http://localhost:5000`.

## Key Configuration Files

| File                          | Purpose                                      |
| ----------------------------- | -------------------------------------------- |
| `backend/config/env.js`       | Validates required env vars on startup       |
| `backend/config/paths.js`     | Canonical paths for uploads, logs, data dirs |
| `backend/config/redis.js`     | Redis connection (optional)                  |
| `backend/ecosystem.config.js` | PM2 process config                           |
| `frontend/src/setupProxy.js`  | CRA dev proxy → backend                      |
| `.lintstagedrc.json`          | lint-staged config for husky pre-commit hook |

## Testing

Backend tests live in `backend/tests/`. Jest config: `backend/jest.config.js`.

- Tests match `**/tests/**/*.test.js`
- Run a single test file: `cd backend && npx jest tests/path/to/file.test.js`
- Integration tests require a running MongoDB; unit tests mock DB

## Production

- Backend managed by PM2: `cd backend && npm run start:pm2:prod`
- Frontend built with `npm run build` and served as static files via Nginx
- Health check endpoints: `GET /health` and `GET /api/health`
- Swagger API docs: `GET /api/swagger`
