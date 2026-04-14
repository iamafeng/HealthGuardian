# AGENTS.md — HealthGuardian Codebase Guide

## Architecture Overview

Three-layer hybrid stack running as a single deployable unit:
- **Backend**: Spring Boot 2.7.5 (Java 8) — REST API + static file hosting, port **8081**
- **Frontend**: Vanilla JS SPA in `src/main/resources/static/` — no build step; changes are live after `mvn package`
- **Desktop shell**: GuardianDesktop (`GuardianDesktop/`) wraps the web UI, auto-discovers backend port from `application.properties`

All REST endpoints live in one file: `src/main/java/com/healthguardian/ReminderController.java`.  
All frontend logic lives in `src/main/resources/static/js/app.js` — a single file containing two top-level config objects (`Themes`, `TextStyles`) followed by named modules: `App` (state/lifecycle), `UI` (rendering), `API` (fetch wrapper), `Workout` (multi-step exercise sequences), `Breathing` (4-7-8 timer), `AmbientSound` (Web Audio noise generator), `Pet` (health pet sidebar), `Weather` (Open-Meteo environment awareness). Posture detection is in `cv.js` (TF.js MoveNet).  
`widget.html` is a second static page served at `/widget.html` — loaded by the GuardianDesktop floating widget (`Ctrl+Shift+W`); it reads `localStorage` keys for pomo state, posture, weather, quiet hours, and meeting data, **and also polls `/api/stats` + `/api/streak` directly every 30 s** via `refreshStats()`.

## Build & Run

```bash
# Backend (from project root)
mvn clean package
java -jar target/health-guardian-0.0.1-SNAPSHOT.jar
# → http://localhost:8081

# GuardianDesktop desktop (separate process)
cd GuardianDesktop
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
- **`t_reminder_log` multi-type**: stores `DRINK`, `SEDENTARY`, and `PET_FEED` as `remind_type`. `PET_FEED` is used exclusively to count pet feeding interactions for the `PET_LOVER` achievement (threshold: 5 times).

### Key Tables
| Table | Purpose |
|---|---|
| `t_user` | Registered accounts (guests omitted). V4.3 新增：`coins` (INT, 小鱼干币), `selected_cat` (VARCHAR, 当前猫咪), `unlocked_cats` (TEXT, 已解锁猫咪逗号分隔) |
| `t_reminder_config` | Per-user reminder intervals (`DRINK` / `SEDENTARY`) |
| `t_reminder_log` | Completed check-in events (also `PET_FEED`) |
| `t_pomodoro_log` | Focus session completions |
| `t_achievement` / `t_user_achievement` | Achievement definitions & earned status |
| `t_partner` | Bidirectional buddy relationships |

## Complete REST API Reference

All endpoints are in `ReminderController.java` under `@RequestMapping("/api")`.

| Method | Path | Key Params | Description |
|---|---|---|---|
| GET | `/api/configs` | `secretKey`, `username` | Load user config; creates guest if no key. Returns `isRegistered` flag. |
| POST | `/api/complete` | `type`, `secretKey` | Log a check-in (`DRINK`/`SEDENTARY`); triggers achievement checks. |
| GET | `/api/stats` | `secretKey` | Today/weekly/hourly stats, HP value, system message, total focus time. |
| GET | `/api/stats/heatmap` | `secretKey` | 90-day daily check-in counts for heatmap. |
| GET | `/api/stats/weekly-report` | `secretKey` | This week vs last week drink/rest/focus comparison. |
| GET | `/api/streak` | `secretKey` | Consecutive check-in days + whether today is done. |
| GET | `/api/leaderboard` | — | Top 10 users by total check-in count. |
| POST | `/api/user/auth` | `username`, `password`, `currentKey?` | Unified auth: auto-detects register vs login. Migrates guest data on login. |
| POST | `/api/user/bind` | `username`, `password`, `secretKey` | Legacy bind endpoint (kept for backward compat). |
| GET | `/api/user/login` | `username`, `password`, `currentTempKey?` | Legacy login endpoint (kept for backward compat). |
| POST | `/api/user/webhook` | `secretKey`, `webhookUrl`, `enabled`, `quietEnabled`, `quietStart`, `quietEnd` | Save webhook + quiet hours settings. |
| GET | `/api/user/achievements` | `secretKey` | All achievements with `is_achieved` and `is_hidden` flags. |
| POST | `/api/pomodoro/complete` | `secretKey`, `duration?` | Log a pomodoro session; awards FOCUS_MASTER (≥5) / PRODUCTIVITY_BEAST (≥10). |
| POST | `/api/notify/webhook` | `secretKey`, `message` | Send webhook push. Prepends `[Health]` to message. Skips guests/disabled. |
| POST | `/api/configs/update` | `secretKey`, `type`, `minutes` | Update reminder interval. |
| GET | `/api/daily-brief` | `secretKey` | AI daily brief: yesterday stats, streak, total days, best hour, today count. |
| GET | `/api/partner/my-code` | `secretKey` | My invite code (username) + current partner list. |
| POST | `/api/partner/bind` | `myKey`, `inviteCode` | Bind partner by username (bidirectional INSERT IGNORE). |
| GET | `/api/partner/stats` | `myKey` | All partners' today drink/rest counts + week active days. |
| POST | `/api/partner/unbind` | `myKey`, `partnerKey` | Remove partner relationship (both directions). |
| POST | `/api/partner/nudge` | `myKey`, `partnerKey` | Send nudge directly to partner's webhook. Uses `⚡【搭子督促】` prefix — does NOT carry `[Health]`. |
| POST | `/api/pet/feed` | `secretKey` | Log pet feeding; awards `PET_LOVER` at 5 cumulative feeds. |
| GET | `/api/adaptive-schedule` | `secretKey` | Analyze historical check-in gaps (MySQL 8 window functions). Requires ≥10 records. |
| GET | `/api/pet/coins` | `secretKey` | 获取小鱼干币数量、当前猫咪、已解锁猫咪列表 |
| POST | `/api/pet/earn-coins` | `secretKey`, `amount?` | 发放小鱼干币（番茄钟完成时自动调用，每次+10）|
| POST | `/api/pet/buy-cat` | `secretKey`, `catId` | 购买猫咪（扣除小鱼干币，写入 unlocked_cats）|
| POST | `/api/pet/select-cat` | `secretKey`, `catId` | 切换当前猫咪（需已解锁）|

### Achievement Award Logic (`checkAchievements` in `ReminderController`)

Called on every `/api/complete`. All awards use `INSERT IGNORE` (safe to call repeatedly).

| Code | Trigger Condition |
|---|---|
| `EARLY_BIRD` | Current time before 08:30 |
| `NIGHT_OWL` | Current time after 22:00 |
| `MIDNIGHT_GHOST` | Current time before 04:00 (hidden) |
| `DAWN_WARRIOR` | Before 07:00 AND it's the first check-in of the day (hidden) |
| `WATER_BUFFALO` | DRINK count today ≥ 8 |
| `HYDRO_CHAMPION` | DRINK count today ≥ 10 (hidden) |
| `STRETCH_EXPERT` | Total SEDENTARY logs ≥ 20 |
| `PERSISTENCE` | Distinct check-in days in last 7 days ≥ 7 |
| `FOCUS_MASTER` | Total pomodoro sessions ≥ 5 (awarded in `/api/pomodoro/complete`) |
| `PRODUCTIVITY_BEAST` | Total pomodoro sessions ≥ 10 (awarded in `/api/pomodoro/complete`) |
| `COMMUNITY_STAR` | On first successful account registration (awarded in `/api/user/auth`) |
| `PET_LOVER` | PET_FEED log count ≥ 5 (awarded in `/api/pet/feed`) |

## Key Patterns

**Auth flow** (`/api/user/auth`): single endpoint handles both register and login — checks if username exists to branch. On login, migrates guest data (`UPDATE IGNORE` for logs, achievements, pomodoro, partner relations). Legacy `/api/user/bind` and `/api/user/login` are kept for backward compatibility.

**Achievement awards**: call `award(secretKey, "CODE")` anywhere; uses `INSERT IGNORE` so it's safe to call repeatedly. Achievement codes are string constants (e.g., `EARLY_BIRD`, `PET_LOVER`).

**Webhook push**: messages must be prefixed `[Health]` to pass DingTalk keyword filter. Push is skipped silently for guests and disabled accounts. See `sendWebhook()` and `nudgePartner()` for the pattern. **Exception**: `nudgePartner()` (`POST /api/partner/nudge`) bypasses `/api/notify/webhook` and posts directly to the partner's webhook URL with an `⚡【搭子督促】` prefix — this message does not carry `[Health]`.

**HP calculation** (`/api/stats`): `min(100, 40 + totalTasksToday * 10)`. System message changes at thresholds: >85 stable, >65 mild dehydration, >40 stiffness warning, ≤40 critical.

**Frontend state**: `App.state` is a single object in `app.js`. Theme (`cyber`/`forest`/`ocean`/`light`) and text style are persisted in `localStorage` under keys `hg_theme` / `hg_text_style`. Full `localStorage` key inventory:

| Key | Writer | Reader | Purpose |
|---|---|---|---|
| `health_guardian_key` | `App.loadData()` | `App.state.secretKey` | UUID secret key |
| `hg_theme` / `hg_text_style` | `App.setTheme/setTextStyle()` | `App.state` init | UI preferences |
| `hg_quiet_enabled` / `hg_quiet_start` / `hg_quiet_end` | `App.saveWebhook()` | `App.isInQuietHours()`, `widget.html` | Quiet hours (also server-synced) |
| `hg_cached_configs` / `hg_cached_username` | `App.loadData()` | `App.loadData()` on network error | Offline fallback |
| `hg_pomo_state` | `App.startPomo()` / `App.stopPomo()` | `widget.html` | Pomodoro countdown bridge to widget. JSON: `{running, endAt, duration}` |
| `hg_weather` | `Weather._fetch()` | `widget.html` | Weather cache bridge to widget. JSON: `{icon, label, rainy, temp, code, windspeed}` |
| `hg_posture_bad` | `cv.js` | `widget.html`, `Pet.setBadPosture()` | CV posture bridge to widget. Value: `'1'` or `'0'` |
| `hg_last_brief` | `App.checkDailyBrief()` | `App.checkDailyBrief()` | Show AI daily brief once per day (stores date string) |
| `hg_meeting_end` | `App.scheduleMeeting()` | `App.init()`, `App._checkMeetingEnd()`, `widget.html` | Meeting end ISO timestamp (deleted after trigger) |
| `hg_meeting_title` | `App.scheduleMeeting()` | `App._checkMeetingEnd()`, `App.openMeetingModal()`, `widget.html` | Meeting title shown in toast on trigger |
| `desktop_notify_enabled` | `App.saveWebhook()` | `App.triggerAlarm()` | Browser notification toggle (local only) |
| `hg_selected_cat` | `Pet.applySelectedCat()` | `widget.html` | 当前猫咪品种桥接键（widget 每秒读取同步精灵图）|

**Quiet hours** (`App.isInQuietHours()`): reads `App.state.quietHours` (synced from server on `loadData`; falls back to `localStorage`). When active, `triggerAlarm` silently resets `lastNotified` and skips the alarm. Quiet hours are saved to both `localStorage` and `t_user` (via `POST /api/user/webhook`) in `App.saveWebhook()`; guests only get local storage. Cross-midnight ranges (e.g., 21:00→07:00) are handled correctly: `start > end ? (cur >= start || cur < end) : (cur >= start && cur < end)`.

**Offline cache fallback**: `App.loadData()` writes `hg_cached_configs` and `hg_cached_username` to `localStorage` on every successful API call. On network failure it reads these keys and enters offline mode — `isRegistered` stays false in that state.

**Workout multi-step sequences**: `Workout.start(sequenceName?)` auto-picks sequence by hour of day (`full` 08–12, `desk` 12–18, `standard` otherwise). Each step has its own `duration`, SVG illustration, `target`, `desc`, and `breath` cue. Audio countdown beeps at last 3 s; completion tone + vibration on finish. Available sequences: `standard`, `desk`, `eye`, `full` (keys in `Workout.sequences`).

**Weather → AmbientSound auto-play**: `Weather._fetch()` (Open-Meteo API, no API key, geolocation-based, refreshes every 30 min) calls `AmbientSound.play('rain')` automatically when `weathercode` maps to a rainy condition (codes 45–57 drizzle, 58–67 rain, 80–82 showers, 95–99 thunderstorm). Weather data is cached in `hg_weather` for `widget.html`. Geolocation errors are silently swallowed. Temperature tips: ≥32°C → drink more water; ≤5°C → keep warm.

**AmbientSound audio files**: three real MP3 files served from `/audio/`:
- `white` → `liecio-calming-rain-257596.mp3`
- `rain` → `eryliaa-rain-and-birds-singing-in-the-forest-422415.mp3`
- `cafe` → `freesound_community-birds-in-the-morning-24147.mp3`

**Dynamic Flow Audio** (`AmbientSound.toggleFlow()`): when enabled, a binaural alpha-wave generator (200 Hz left / 210 Hz right → 10 Hz beat via `StereoPannerNode`) is mixed on top of any playing ambient sound. `CV.detectFrame()` computes a focus score every frame — `(badPosture ? 0.15 : 0.6) + (blinkOk ? 0.4 : 0.0)` — and calls `AmbientSound.updateFocusState(score)`. Every 2 s, `_applyFlow()` sets master gain and alpha gain via `setTargetAtTime` for smooth exponential fade. `CV.stop()` resets the focus score to 1.0. Indicator: `#flow-indicator` div + `#flow-score-bar` bar updated by `cv.js`.

**Flow audio gain table**:
| Focus Score | Master Gain | Alpha Gain |
|---|---|---|
| ≥ 0.7 | 0.85 (100%) | 0.022 |
| 0.4–0.7 | 0.72 (85%) | 0.008 |
| < 0.4 | 0.43 (50%) | 0 (off) |

**Meeting-end stretch trigger** (`App.scheduleMeeting(timeStr, title)`): user sets an HH:MM meeting end time; the Date is persisted in `hg_meeting_end` / `hg_meeting_title` localStorage and stored in `App.state.meetingEndAt`. Every 60 s, `startGlobalBackgroundTimer()` calls `_checkMeetingEnd()` — when `now >= endAt`, fires `Workout.start('desk')` + webhook `[Health]【日程提醒】`. Past end times on page load are discarded without triggering. If the set time has already passed today, it is automatically pushed to the next day. Countdown shown in `#meeting-bar` (sidebar), updated every 60 s and immediately on schedule/cancel.

**GuardianDesktop ↔ backend URL**: port config resolution order is: (1) `%APPDATA%/hg-config.json` (user override), (2) `GuardianDesktop/config.json`, (3) `application.properties` regex `server.port`. User can also override via tray menu → saves to `%APPDATA%/hg-config.json`. Global shortcut `Ctrl+Shift+H` toggles the main window; `Ctrl+Shift+W` toggles `widgetWindow` (the 🏝️ floating 灵动岛, 252×182, frameless, always-on-top, positioned bottom-right). `window.isGuardianDesktopApp = true` is injected via `injectGuardianDesktopFlag()` after `did-finish-load`. Hardware acceleration is disabled (`app.disableHardwareAcceleration()`) for broader compatibility.

**GuardianDesktop permission auto-grant**: `session.defaultSession.setPermissionRequestHandler` auto-approves `notifications`, `media`, and `geolocation` — no browser permission popups in the desktop app.

**GuardianDesktop native notifications**: `ipcMain.on('show-notification', ...)` receives `{title, body}` from the renderer and fires `new GuardianDesktopNotification(...)`. The renderer sends via `ipcRenderer.send('show-notification', ...)` inside `App.triggerAlarm()` when `window.isGuardianDesktopApp` is true.

**Single-instance lock** (`app.requestSingleInstanceLock()`): called at the very top of `main.js` before `app.whenReady()`. If the lock is NOT acquired (another instance is already running), `app.quit()` is called immediately. The primary instance listens for `second-instance` to restore/focus its main window. This prevents: (a) multiple background processes accumulating, (b) duplicate reminder notifications, (c) competing LevelDB writes to the shared session store (which would wipe `localStorage` in the new instance and force re-login). On window close, a dialog asks the user to choose between "minimize to tray" or "quit completely" — the first-time tray balloon is shown only once (`_trayBalloonShown` flag).

**GuardianDesktop backend polling**: `checkBackendStatusAndLoad()` probes the backend URL on startup; if unreachable, loads `GuardianDesktop/error.html` (with `?url=<backendUrl>`) and retries every 5 s until the backend responds. The `update-backend-url` IPC message (from `error.html`) updates `backendUrl` at runtime and triggers a re-probe.

**GuardianDesktop IPC channels**:
| Channel | Direction | Action |
|---|---|---|
| `widget-close` | widget → main | Hide widget window |
| `widget-minimize` | widget → main | Minimize widget window |
| `widget-open-main` | widget → main | Show and focus main window |
| `show-notification` | renderer → main | Fire native OS notification with `{title, body}` |
| `update-backend-url` | error.html → main | Update backend URL and re-probe |

**Tray menu entries**: 显示控制板 / 🏝️ 切换健康灵动岛 / 👤 账号同步（跨端登录）/ 修改服务器地址 / ⭐ GitHub 开源地址 / ☕ 赏作者一杯咖啡 / 彻底退出. "账号同步" calls `UI.modal.showAuth()` via `executeJavaScript`; "赏咖啡" calls `UI.modal.show('donate-modal')`.

**CV posture detection** (`cv.js`): uses MoveNet SINGLEPOSE_LIGHTNING at 320×240. After a 3 s warmup, `calibrateBaseline()` records the inter-eye pixel distance (`eyeDist`) as `this.baseline`. On each frame, if `eyeDist > this.baseline * 1.4` → bad posture (user is leaning too close to camera). After 45 consecutive bad-posture frames (~1-2 s), `triggerWarning()` fires at most once per 15 s: flashes red vignette, launches `Workout.start('eye')`, and sends a webhook alert. Eye-fatigue trigger: 20 minutes of continuous face detection → `triggerEyeFatigueAlert()` → `Workout.start('eye')` + webhook. Both triggers call `API.post('/api/notify/webhook', …)` only for registered users (`App.state.isRegistered`). `cv.js` also writes `hg_posture_bad` to localStorage (`'1'`/`'0'`) and calls `Pet.setBadPosture(bool)`.

**Pet module** (`Pet` in `app.js`): sprite-based pixel cat with 4×4 sprite sheet (4 states × 4 frames). States: `idle` (row 0), `walk` (row 1), `play` (row 2), `sleep` (row 3). Animation runs at 200 ms/frame via `setInterval`. `Pet.update(drinkToday, restToday)` sets HP and mood text based on total daily check-ins. `Pet.setBadPosture(true)` forces `sleep` state, decreases clean by 10, and shows a warning speech bubble. `Pet.handleClick(e)` handles both drag and click: left mousedown starts drag tracking (5px threshold), if not dragged calls `interact()`; right click opens pet modal. `Pet.interact()` plays `meow.wav`, triggers `play` state for 2 s, shows random speech, and applies a bounce transform. After 8+ clicks, the pet gets "angry" for 5 s. Hover triggers `play` state for 1 s. Pet feeding (via the pet UI button) calls `App.completeTask('DRINK', null, true)` without closing the modal.

**Pet audio files** (served from `/pet/audio/`): `meow.wav`, `eat.wav`, `buy.wav`, `clean.wav`, `coin.wav`, `unlock.wav`, `work.wav`, `bgm.wav`.

**Pet sprite images** (served from `/pet/img/`): 9 cat variants — `cat_Bengal.png`, `cat_BlackCat.png`, `cat_BritishShorthair-Blue.png`, `cat_Calico.png`, `cat_MaineCoon.png`, `cat_OrangeTabby.png`, `cat_Ragdoll.png`, `cat_Sphynx.png`, `cat_Tuxedo.png`.

**Pet economy system**: `Pet.coins` tracks fish-coin balance. `Pet.applySelectedCat(catId)` switches sprite image and writes `hg_selected_cat` to localStorage. `Pet.openShop()` renders the shop modal with 9 cat variants. `Pet._shopCardClick(catId, price, owned)` handles buy/select logic. Cat prices: OrangeTabby free, Bengal/Calico 100, Tuxedo/BlackCat 150, BritishShorthair-Blue 200, Ragdoll 250, MaineCoon 300, Sphynx 500.

**Pet vitals system**: `Pet.updateVitals(drinkToday, restToday)` computes hunger and energy based on reminder intervals — reads `App.state.reminders` to find DRINK/SEDENTARY `lastNotified` timestamps, calculates `(1 - elapsed/intervalMs) * 100` so values decay in real-time and reset to 100 on check-in. Clean decreases by 5 per tick when bad posture, increases by 2 otherwise. All three render to progress bars in `#pet-modal`. `startGlobalBackgroundTimer` calls `updateVitals` every 60s for real-time decay.

**widget.html v2 (Pet Sprite)**: Replaced data card with cat sprite (96×96, 4-state animation). Collapsed state: sprite + hp bar only (140×140). Hover: expands data panel (240×310) via `widget-resize` IPC, mouse leave auto-collapses after 500ms. Left click: `openMain()`. Right click: `petInteract()` (meow + play animation + speech bubble). Bad posture: sprite gets red filter + sleep state. Draggable via `-webkit-app-region: drag` on `.pet-wrap`. Close button only visible on hover.

**`Themes` and `TextStyles`** top-level objects in `app.js`: `Themes` maps theme names (`cyber`/`forest`/`ocean`/`light`) to CSS variable sets applied by `App.applyTheme(name)`. `TextStyles` maps style names (`mecha`/`gentle`/`silly`/`strict`) to reminder text templates (drinkTitle, drinkBody fn, restTitle, restBody fn) consumed in `App.triggerAlarm()`. Both are plain `const` objects defined before any module.

**`App.state` full structure**:
```js
{
  secretKey,        // from localStorage 'health_guardian_key'
  username,         // '匿名用户' until loadData
  isRegistered,     // false until server confirms
  pomo: { interval, timeLeft, isRunning },
  workout: { interval, timeLeft },
  charts: { weekly, hourly },  // Chart.js instances
  theme,            // from localStorage 'hg_theme'
  textStyle,        // from localStorage 'hg_text_style'
  meta: { medalMap },  // achievement code → emoji
  reminders: [],    // configs with lastNotified timestamps
  achievementsData: [],
  pet: { drinkToday, restToday },
  meetingEndAt,     // Date or null
  quietHours: { enabled, start, end }
}
```

**`App.triggerAlarm(reminder)`**: dual-channel alert — (1) native notification via GuardianDesktop IPC or `new Notification()` in browser (respects `desktop_notify_enabled`); (2) webhook push via `/api/notify/webhook` (registered users only). Uses `TextStyles[state.textStyle]` for title/body. Guest nickname is "神秘特工".

**`App.completeTask(type, btn, fromPet)`**: posts to `/api/complete`, resets `lastNotified`, updates pet state, plays `eat.wav` on DRINK, calls `/api/pet/feed` if `fromPet=true`, sends webhook praise message (registered users only), then calls `refreshDashboard()`.

**`App.refreshDashboard()`**: parallel `Promise.all` fetching stats, leaderboard, achievements, streak, heatmap — then renders all UI components and syncs pet state.

**`App._updateGuardianDesktopBadge()`**: shows/hides `#electron-sync-bar` sidebar element. Green "已同步" if registered, yellow "匿名模式" if guest. Checked 1.2 s after init to allow `isGuardianDesktopApp` injection time.

**MySQL 8 window functions** are used in `/api/adaptive-schedule` (LAG over partitioned reminder logs) — do not downgrade MySQL below 8.0.

## Frontend Module Map

| Module | Lines (approx) | Responsibility |
|---|---|---|
| `Themes` | 1–67 | CSS variable presets for 4 themes |
| `TextStyles` | 68–91 | Reminder text templates for 4 styles |
| `App` | 92–791 | State, lifecycle, auth, alarms, pomo, meeting, partner, adaptive |
| `UI` | 792–1093 | DOM rendering, toast, modal, charts, heatmap, leaderboard |
| `API` | 1094–1099 | Thin fetch wrapper (`get`/`post`) |
| `Workout` | 1100–1247 | Multi-step exercise sequences with SVG + audio |
| `Breathing` | 1248–1319 | 4-7-8 breathing timer with phase animation |
| `AmbientSound` | 1320–1492 | Web Audio API: real audio files + binaural alpha generator |
| `Pet` | 1493–1664 | Sprite animation, mood, interaction, posture sync |
| `Weather` | 1665–end | Open-Meteo fetch, weather code mapping, auto-sound trigger |

## Mandatory Documentation Rule

> After every feature or schema change, update **both** `README.md` and `快速运行.md` simultaneously. Deployment/startup commands are maintained **only** in `快速运行.md`.

## Desktop Sync Rule

> After completing any web page feature, you **must** verify whether the GuardianDesktop desktop shell needs to be updated. Specifically:
> - If the feature uses new `localStorage` keys as a bridge (e.g., for the 🏝️ widget), update `widget.html` and `GuardianDesktop/main.js` accordingly.
> - If the feature adds new tray menu entries, IPC channels, or window behaviors, update `GuardianDesktop/main.js`.
> - If the feature introduces new global shortcuts, register them in `GuardianDesktop/main.js` via `globalShortcut.register`.
> - The desktop shell must always reflect the same feature set as the web UI.

## Linux Deployment

Use scripts in `sh/` (not a Maven plugin):
```bash
chmod +x sh/*.sh
# Upload new JAR to deploy/ directory, then:
sh/start.sh      # detects deploy/, backs up current, starts new version
sh/rollback.sh   # reverts to last backup in bak/
```

## Common Pitfalls & Known Patterns

- **`isRegistered` check**: always gate webhook pushes and partner features behind `App.state.isRegistered`. Guests silently skip server-side operations.
- **`INSERT IGNORE` everywhere**: achievements, partner links, and seed data all use `INSERT IGNORE` — never plain `INSERT`.
- **`UPDATE IGNORE` for migrations**: guest data migration in `/api/user/auth` uses `UPDATE IGNORE` to avoid unique constraint violations.
- **`Promise.all` for parallel loads**: `openPartnerModal()` and `refreshDashboard()` both use `Promise.all` — never serialize independent API calls.
- **`hg_pomo_state` JSON shape**: `{running: bool, endAt: timestamp_ms, duration: seconds}`. Widget reads `endAt - Date.now()` to compute remaining time.
- **`nudgePartner` does NOT use `/api/notify/webhook`**: it posts directly to the partner's webhook URL with `⚡【搭子督促】` prefix (no `[Health]` prefix).
- **`/api/configs` returns `quietEnabled/quietStart/quietEnd`**: these come from `t_user` columns. Frontend syncs them into `App.state.quietHours` and localStorage on every `loadData()`.
- **Pet feeding flow**: UI button → `App.completeTask('DRINK', null, true)` → `API.post('/api/pet/feed')` → awards `PET_LOVER` at 5 feeds. The DRINK log is also written, so it counts toward `WATER_BUFFALO`/`HYDRO_CHAMPION`.
- **Workout SVG assets**: located at `/workout/*.svg`. Available files: `neck.svg`, `chest.svg`, `squat.svg`, `shoulder.svg`, `wrist.svg`, `eyes.svg`, `back.svg`.
- **`App.init()` startup sequence**: applyTheme → setupPWA → restore meeting → detect GuardianDesktop (with 1.2 s delay) → show welcome modal OR loadData → startGlobalBackgroundTimer → checkDailyBrief → Weather.init() → Pet.startAnimation().
- **`App.startNewIdentity()`**: clears `health_guardian_key`, `hg_cached_configs`, `hg_cached_username` from localStorage, then reloads. UI preferences (theme, text style) are preserved.
