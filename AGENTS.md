# AGENTS.md — HealthGuardian Codebase Guide

## Architecture Overview

Three-layer hybrid stack running as a single deployable unit:
- **Backend**: Spring Boot 2.7.5 (Java 8) — REST API + static file hosting, port **8081**
- **Frontend**: Vanilla JS SPA in `src/main/resources/static/` — no build step; changes are live after `mvn package`
- **Desktop shell**: Electron (`electron/`) wraps the web UI, auto-discovers backend port from `application.properties`

All REST endpoints live in one file: `src/main/java/com/healthguardian/ReminderController.java`.  
All frontend logic lives in `src/main/resources/static/js/app.js` — a single file containing two top-level config objects (`Themes`, `TextStyles`) followed by named modules: `App` (state/lifecycle), `UI` (rendering), `API` (fetch wrapper), `Workout` (multi-step exercise sequences), `Breathing` (4-7-8 timer), `AmbientSound` (Web Audio noise generator), `Pet` (health pet sidebar), `Weather` (Open-Meteo environment awareness). Posture detection is in `cv.js` (TF.js MoveNet).  
`widget.html` is a second static page served at `/widget.html` — loaded by the Electron floating widget (`Ctrl+Shift+W`); it reads `localStorage` keys for pomo state, posture, weather, quiet hours, and meeting data, **and also polls `/api/stats` + `/api/streak` directly every 30 s** via `refreshStats()`.

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
- **`t_user` quiet-hours columns**: `quiet_enabled` (TINYINT), `quiet_start` (VARCHAR `'21:00'`), `quiet_end` (VARCHAR `'07:00'`) — updated by `POST /api/user/webhook` alongside webhook settings. Not created by `@PostConstruct`; must be added via schema migration if absent.
- **`t_achievement.is_hidden`**: TINYINT(1) column added idempotently via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` inside `@PostConstruct`. Hidden achievements (codes: `MIDNIGHT_GHOST`, `HYDRO_CHAMPION`, `DAWN_WARRIOR`, `PET_LOVER`) are set to `is_hidden=1` on every startup.
- **Password hashing**: `hashPassword()` in `ReminderController` uses SHA-256 (hex string). Stored in `t_user.password_hash`. Guests have no password; old accounts may have empty `password_hash` and receive a password on first auth.
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

**Webhook push**: messages must be prefixed `[Health]` to pass DingTalk keyword filter. Push is skipped silently for guests and disabled accounts. See `sendWebhook()` and `nudgePartner()` for the pattern. **Exception**: `nudgePartner()` (`POST /api/partner/nudge`) bypasses `/api/notify/webhook` and posts directly to the partner's webhook URL with an `⚡【搭子督促】` prefix — this message does not carry `[Health]`.

**Frontend state**: `App.state` is a single object in `app.js`. Theme (`cyber`/`forest`/`ocean`/`light`) and text style are persisted in `localStorage` under keys `hg_theme` / `hg_text_style`. Full `localStorage` key inventory:

| Key | Writer | Reader | Purpose |
|---|---|---|---|
| `health_guardian_key` | `App.loadData()` | `App.state.secretKey` | UUID secret key |
| `hg_theme` / `hg_text_style` | `App.setTheme/setTextStyle()` | `App.state` init | UI preferences |
| `hg_quiet_enabled` / `hg_quiet_start` / `hg_quiet_end` | `App.saveWebhook()` | `App.isInQuietHours()`, `widget.html` | Quiet hours (also server-synced) |
| `hg_cached_configs` / `hg_cached_username` | `App.loadData()` | `App.loadData()` on network error | Offline fallback |
| `hg_pomo_state` | `App.startPomo()` / `App.stopPomo()` | `widget.html` | Pomodoro countdown bridge to widget |
| `hg_weather` | `Weather._fetch()` | `widget.html` | Weather cache bridge to widget |
| `hg_posture_bad` | `cv.js` | `widget.html`, `Pet.setBadPosture()` | CV posture bridge to widget |
| `hg_last_brief` | `App.checkDailyBrief()` | `App.checkDailyBrief()` | Show AI daily brief once per day |
| `hg_meeting_end` | `App.scheduleMeeting()` | `App.init()`, `App._checkMeetingEnd()`, `widget.html` | Meeting end ISO timestamp (deleted after trigger) |
| `hg_meeting_title` | `App.scheduleMeeting()` | `App._checkMeetingEnd()`, `App.openMeetingModal()`, `widget.html` | Meeting title shown in toast on trigger |
| `desktop_notify_enabled` | `App.saveWebhook()` | `App.triggerAlarm()` | Browser notification toggle (local only) |

**Quiet hours** (`App.isInQuietHours()`): reads `App.state.quietHours` (synced from server on `loadData`; falls back to `localStorage`). When active, `triggerAlarm` silently resets `lastNotified` and skips the alarm. Quiet hours are saved to both `localStorage` and `t_user` (via `POST /api/user/webhook`) in `App.saveWebhook()`; guests only get local storage.

**Offline cache fallback**: `App.loadData()` writes `hg_cached_configs` and `hg_cached_username` to `localStorage` on every successful API call. On network failure it reads these keys and enters offline mode — `isRegistered` stays false in that state.

**Workout multi-step sequences**: `Workout.start(sequenceName?)` auto-picks sequence by hour of day (`full` 08–12, `desk` 12–18, `standard` otherwise). Each step has its own `duration`, SVG illustration, `target`, `desc`, and `breath` cue. Audio countdown beeps at last 3 s; completion tone + vibration on finish. Available sequences: `standard`, `desk`, `eye`, `full` (keys in `Workout.sequences`).

**Weather → AmbientSound auto-play**: `Weather._fetch()` (Open-Meteo API, no API key, geolocation-based, refreshes every 30 min) calls `AmbientSound.play('rain')` automatically when `weathercode` maps to a rainy condition. Weather data is cached in `hg_weather` for `widget.html`. Geolocation errors are silently swallowed.

**Dynamic Flow Audio** (`AmbientSound.toggleFlow()`): when enabled, a binaural alpha-wave generator (200 Hz left / 210 Hz right → 10 Hz beat via `StereoPannerNode`) is mixed on top of any playing ambient sound. `CV.detectFrame()` computes a focus score every frame — `(badPosture ? 0.15 : 0.6) + (blinkOk ? 0.4 : 0.0)` — and calls `AmbientSound.updateFocusState(score)`. Every 2 s, `_applyFlow()` sets master gain and alpha gain via `setTargetAtTime` for smooth exponential fade. `CV.stop()` resets the focus score to 1.0. Indicator: `#flow-indicator` div + `#flow-score-bar` bar updated by `cv.js`.

**Meeting-end stretch trigger** (`App.scheduleMeeting(timeStr, title)`): user sets an HH:MM meeting end time; the Date is persisted in `hg_meeting_end` / `hg_meeting_title` localStorage and stored in `App.state.meetingEndAt`. Every 60 s, `startGlobalBackgroundTimer()` calls `_checkMeetingEnd()` — when `now >= endAt`, fires `Workout.start('desk')` + webhook `[Health]【日程提醒】`. Past end times on page load are discarded without triggering. Countdown shown in `#meeting-bar` (sidebar), updated every 60 s and immediately on schedule/cancel.

**Electron ↔ backend URL**: port config resolution order is: (1) `%APPDATA%/hg-config.json` (user override), (2) `electron/config.json`, (3) `application.properties` regex `server.port`. User can also override via tray menu → saves to `%APPDATA%/hg-config.json`. Global shortcut `Ctrl+Shift+H` toggles the main window; `Ctrl+Shift+W` toggles `widgetWindow` (the 🏝️ floating 灵动岛, 252×182, frameless, always-on-top, positioned bottom-right). `window.isElectronApp = true` is injected via `injectElectronFlag()` after `did-finish-load`. Hardware acceleration is disabled (`app.disableHardwareAcceleration()`) for broader compatibility.

**Single-instance lock** (`app.requestSingleInstanceLock()`): called at the very top of `main.js` before `app.whenReady()`. If the lock is NOT acquired (another instance is already running), `app.quit()` is called immediately. The primary instance listens for `second-instance` to restore/focus its main window. This prevents: (a) multiple background processes accumulating, (b) duplicate reminder notifications, (c) competing LevelDB writes to the shared session store (which would wipe `localStorage` in the new instance and force re-login). The first time the user closes the window, a `tray.displayBalloon()` notification informs them the app keeps running in the system tray; right-click tray → 彻底退出 fully exits.

**Electron backend polling**: `checkBackendStatusAndLoad()` probes the backend URL on startup; if unreachable, loads `electron/error.html` (with `?url=<backendUrl>`) and retries every 5 s until the backend responds. The `update-backend-url` IPC message (from `error.html`) updates `backendUrl` at runtime and triggers a re-probe.

**Electron IPC channels** (widget → main): `widget-close` hides the widget window; `widget-minimize` minimizes it; `widget-open-main` shows and focuses the main window. Tray entries call `UI.modal.showAuth()` (account sync) and `UI.modal.show('donate-modal')` (coffee) via `executeJavaScript`.

**CV posture detection** (`cv.js`): uses MoveNet SINGLEPOSE_LIGHTNING at 320×240. After a 3 s warmup, `calibrateBaseline()` records the inter-eye pixel distance (`eyeDist`) as `this.baseline`. On each frame, if `eyeDist > this.baseline * 1.4` → bad posture (user is leaning too close to camera). After 45 consecutive bad-posture frames (~1-2 s), `triggerWarning()` fires at most once per 15 s: flashes red vignette, launches `Workout.start('eye')`, and sends a webhook alert. Eye-fatigue trigger: 20 minutes of continuous face detection → `triggerEyeFatigueAlert()` → `Workout.start('eye')` + webhook. Both triggers call `API.post('/api/notify/webhook', …)` only for registered users (`App.state.isRegistered`).

**`Themes` and `TextStyles`** top-level objects in `app.js`: `Themes` maps theme names (`cyber`/`forest`/`ocean`/`light`) to CSS variable sets applied by `App.applyTheme(name)`. `TextStyles` maps style names (`mecha`/`gentle`/`silly`/`strict`) to reminder text templates (drinkTitle, drinkBody fn, restTitle, restBody fn) consumed in `App.triggerAlarm()`. Both are plain `const` objects defined before any module.

**MySQL 8 window functions** are used in `/api/adaptive-schedule` (LAG over partitioned reminder logs) — do not downgrade MySQL below 8.0.

## Mandatory Documentation Rule

> After every feature or schema change, update **both** `README.md` and `快速运行.md` simultaneously. Deployment/startup commands are maintained **only** in `快速运行.md`.

## Desktop Sync Rule

> After completing any web page feature, you **must** verify whether the Electron desktop shell needs to be updated. Specifically:
> - If the feature uses new `localStorage` keys as a bridge (e.g., for the 🏝️ widget), update `widget.html` and `electron/main.js` accordingly.
> - If the feature adds new tray menu entries, IPC channels, or window behaviors, update `electron/main.js`.
> - If the feature introduces new global shortcuts, register them in `electron/main.js` via `globalShortcut.register`.
> - The desktop shell must always reflect the same feature set as the web UI.

## Linux Deployment

Use scripts in `sh/` (not a Maven plugin):
```bash
chmod +x sh/*.sh
# Upload new JAR to deploy/ directory, then:
sh/start.sh      # detects deploy/, backs up current, starts new version
sh/rollback.sh   # reverts to last backup in bak/
```

