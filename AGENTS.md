# AGENTS.md — HealthGuardian Codebase Guide

## Architecture Overview

Three-layer hybrid stack running as a single deployable unit:
- **Backend**: Spring Boot 2.7.5 (Java 8) — REST API + static file hosting, port **8081**
- **Frontend**: Vanilla JS SPA in `src/main/resources/static/` — no build step; changes are live after `mvn package`
- **Desktop shell**: Electron (`electron/`) wraps the web UI, auto-discovers backend port from `application.properties`

All REST endpoints live in one file: `src/main/java/com/healthguardian/ReminderController.java`.  
All frontend logic lives in `src/main/resources/static/js/app.js` (App state module) and `cv.js` (TF.js posture engine).

## Build & Run

```bash
# Backend (from project root)
mvn clean package
java -jar target/health-guardian-0.0.1-SNAPSHOT.jar
# → http://localhost:8081

# Electron desktop (separate process)
cd electron
npm install      # first time only
npm run start    # dev mode
npm run dist     # package to .exe (Windows NSIS)
```

Frontend files require **no separate build** — Spring Boot serves `src/main/resources/static/` directly.

## Database Conventions

- **No ORM.** All DB access uses `JdbcTemplate` with raw SQL. No entities, no repositories.
- **Universal user identifier is `secret_key`** (UUID string), not integer `id`. Every table references users via `secret_key`.
- **Guest mode**: visitors get a UUID in `localStorage`, inserted only into `t_reminder_config` — never into `t_user`. On registration, guest data is migrated with `UPDATE IGNORE`.
- **`t_partner` is auto-created** via `@PostConstruct` in `ReminderController` on every startup.
- **Idempotent inserts**: always use `INSERT IGNORE` for achievements, partner links, and seed data.
- **Schema evolution rule**: add both a full-schema block and an incremental-upgrade SQL block to `快速运行.md` for every table change.

### Key Tables
| Table | Purpose |
|---|---|
| `t_user` | Registered accounts (guests omitted) |
| `t_reminder_config` | Per-user reminder intervals (`DRINK` / `SEDENTARY`) |
| `t_reminder_log` | Completed check-in events (also `PET_FEED`) |
| `t_pomodoro_log` | Focus session completions |
| `t_achievement` / `t_user_achievement` | Achievement definitions & earned status |
| `t_partner` | Bidirectional buddy relationships |

## Key Patterns

**Auth flow** (`/api/user/auth`): single endpoint handles both register and login — checks if username exists to branch. Legacy `/api/user/bind` and `/api/user/login` are kept for backward compatibility.

**Achievement awards**: call `award(secretKey, "CODE")` anywhere; uses `INSERT IGNORE` so it's safe to call repeatedly. Achievement codes are string constants (e.g., `EARLY_BIRD`, `PET_LOVER`).

**Webhook push**: messages must be prefixed `[Health]` to pass DingTalk keyword filter. Push is skipped silently for guests and disabled accounts. See `sendWebhook()` and `nudgePartner()` for the pattern.

**Frontend state**: `App.state` is a single object in `app.js`. Theme (`cyber`/`forest`/`ocean`/`light`) and text style are persisted in `localStorage` under keys `hg_theme` / `hg_text_style`.

**Electron ↔ backend URL**: Electron reads port from `application.properties` at startup. User can override via tray menu → saves to `%APPDATA%/hg-config.json`. Global shortcut `Ctrl+Shift+H` toggles the window. `window.isElectronApp = true` is injected so frontend can detect the desktop context.

**MySQL 8 window functions** are used in `/api/adaptive-schedule` (LAG over partitioned reminder logs) — do not downgrade MySQL below 8.0.

## Mandatory Documentation Rule

> After every feature or schema change, update **both** `README.md` and `快速运行.md` simultaneously. Deployment/startup commands are maintained **only** in `快速运行.md`.

## Linux Deployment

Use scripts in `sh/` (not a Maven plugin):
```bash
chmod +x sh/*.sh
# Upload new JAR to deploy/ directory, then:
sh/start.sh      # detects deploy/, backs up current, starts new version
sh/rollback.sh   # reverts to last backup in bak/
```

