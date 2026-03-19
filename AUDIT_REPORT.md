# M.O.U.S.E. Deep Audit Report

Date: 2026-03-18 (Updated: 2026-03-14 — Exhaustive audit pass)

**Remediation 2026-03-14:** Multi-instance session validation, login rate limiting, RTK redaction, sample plugin exec/args, terminal command filtering, automation labeling, control deck arm-from-telemetry, BME688/connection-test/telemetry gating, per-drone command lease with ControlDeck "Controlled by X" UI, `/api/chat-users` auth, dead `useOfflineSync.ts` removed, unused logo assets removed, Tracking panel browser-local disclaimer, VideoFeed device source badges (Demo/Drone camera), 3D mapping production pipeline (DB persistence, PLY export, model listing), camera settings scoped by droneId, FCStateService for mission/fence applied state, TopBar messages server-owned.

Scope: static code audit of the full repository. A feature is only counted as working when the code proves a complete path from UI to backend to persistence/device acknowledgement and back to the UI. Hardware execution, cloud accounts, and attached flight systems are called out as `not verifiable from provided code` where the repository does not prove real-world execution.

## A. Executive Summary

This codebase is feature-rich but not production-ready for field operations.

The strongest parts are:

- password-based auth and session hydration are implemented end-to-end
- admin user and group management has real backend enforcement
- plugin tooling has a bounded execution model with path and executable allowlists
- many panels do call real backend routes instead of being pure mock UI

The highest-risk remaining problems are:

1. Core operational runtime state still mutates in route-local memory in [server/routes.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/server/routes.ts), even though more of it now snapshots to runtime-state JSON.
2. Core persistence is file-backed JSON in [server/storage.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/server/storage.ts), which is not safe for concurrent production use.
3. Multi-user consistency is incomplete because browser-local caches, websocket fanout, process-local runtime state, and file-backed storage are mixed together.
4. Some operational preferences and sync staging still remain browser-local instead of backend-owned.

Production readiness score: **62/100**

## A1. Consolidated Unresolved Issues

The following issues remain open after the current remediation passes:

1. Route-local runtime state is still the active authority for mission runs, automation runs, serial passthrough, RTK/NTRIP, GPS injection, firmware jobs, calibration, audio, and 3D mapping in [server/routes.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/server/routes.ts).
2. Runtime-state JSON snapshotting reduces restart loss, but it is not a transactional multi-instance state model.
3. Core persistence for operational entities remains file-backed in [server/storage.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/server/storage.ts).
4. ~~Automation recipes are still stored in the browser and are not backend-owned or multi-user visible.~~ **RESOLVED** — Recipes are persisted in `automation_recipes` (DB); AutomationPanel uses GET/POST/PATCH/DELETE `/api/automation/scripts`; `lastRun` updated on successful execute.
5. ~~Message state still keeps browser-local backup/cache behavior~~ **RESOLVED** — TopBar uses server as source of truth; no `localStorage` backup for messages. Fetches from `/api/messages`.
6. ~~Offline sync useOfflineSync hook~~ **RESOLVED** — Dead `useOfflineSync.ts` removed (was never imported). Backend `/api/backlog/*` endpoints remain for future use.
7. ~~Camera settings not drone-scoped~~ **RESOLVED** — Camera settings now scoped by `droneId` (GET/PATCH); VideoFeed passes `selectedDrone?.id`.
8. Selected-drone context is still browser-scoped rather than server-scoped for multi-user coordination.
9. Telemetry client authority is still split across websocket events, DOM events, and window globals instead of one typed store.
10. Audio state is still backed by transient route state and partial polling rather than a durable session/service model.
11. ~~Mission/fence/applied-profile truth is not durably recorded per drone~~ **RESOLVED** — FCStateService persists `fc_applied_state` per drone; routes call `recordMissionApplied`/`recordFenceApplied` on upload.
12. Cloud command, telemetry, awareness, and admin endpoints still appear underused or unused by the client.
13. Several hardware-facing flows remain not fully verifiable from the repository alone: real FC actuation, servo/gripper actuation, onboard camera/media, BME688 hardware, RTK/GPS injection on target devices, firmware flashing outcome, and cloud account runtime behavior.
14. Tracking and some media flows still over-rely on browser-local execution paths and should not be treated as proven onboard autonomy subsystems.

## B. Fully Working Features

These are the flows the code most clearly proves.

### 1. Password login, session validation, and logout
- Feature group: User management and access control
- Severity: Low
- Files: [server/routes.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/server/routes.ts#L5870), [server/authStore.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/server/authStore.ts), [server/sessionStore.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/server/sessionStore.ts), [client/src/main.tsx](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/main.tsx), [client/src/components/panels/UserAccessPanel.tsx](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/components/panels/UserAccessPanel.tsx)
- Related components/functions/routes: `/api/auth/login`, `/api/auth/session`, `/api/auth/logout`, `authenticateWithPassword`, `setSession`, `getSession`
- Root cause: N/A, this path is implemented
- Why it matters: establishes the base auth lifecycle
- Exact fix recommendation: keep, then extend server-side auth enforcement to the rest of the route surface
- Confidence level: High

### 2. Admin user CRUD, password reset, and group CRUD
- Feature group: User management and access control
- Severity: Low
- Files: [server/routes.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/server/routes.ts#L5961), [server/authStore.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/server/authStore.ts), [client/src/components/panels/UserAccessPanel.tsx](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/components/panels/UserAccessPanel.tsx)
- Related components/functions/routes: `/api/admin/users`, `/api/admin/users/:id`, `/api/admin/users/:id/reset-password`, `/api/admin/groups`
- Root cause: N/A, this path is implemented with server-side permission middleware
- Why it matters: one of the few domains that consistently enforces auth on the server
- Exact fix recommendation: add CSRF protection or strict bearer strategy if this is exposed beyond a trusted shell
- Confidence level: High

### 3. Plugin tooling execution safety model
- Feature group: Firmware and plugin tooling
- Severity: Low
- Files: [server/pluginToolRunner.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/server/pluginToolRunner.ts), [server/routes.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/server/routes.ts#L5548), [client/src/components/panels/PluginToolchainPanel.tsx](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/components/panels/PluginToolchainPanel.tsx), [tests/critical/pluginToolRunner.test.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/tests/critical/pluginToolRunner.test.ts)
- Related components/functions/routes: `/api/plugins`, `/api/plugins/:id/run-tool`, `/api/plugins/sdk/*`, `buildPluginToolSpawnSpec`
- Root cause: N/A, bounded implementation exists
- Why it matters: proves at least one execution subsystem is built with allowlists and path confinement
- Exact fix recommendation: add per-plugin auth scopes and resource quotas
- Confidence level: High

### 4. Backend command lifecycle bookkeeping
- Feature group: Automation, terminal, and debugging
- Severity: Low
- Files: [server/commandService.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/server/commandService.ts), [tests/critical/commandService.test.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/tests/critical/commandService.test.ts)
- Related components/functions/routes: `CommandService.dispatchAndWait`
- Root cause: N/A, behavior is covered by tests
- Why it matters: queue, ack, fail, and timeout transitions are explicit and test-backed
- Exact fix recommendation: persist command history durably
- Confidence level: High

### 5. Centralized API auth guard for sensitive routes
- Feature group: Security
- Severity: Low
- Files: [server/routes.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/server/routes.ts#L477), [server/routes.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/server/routes.ts#L830)
- Related components/functions/routes: path-level `/api` auth middleware, `apiPermissionForRequest`
- Root cause: N/A, this fix was implemented
- Why it matters: sensitive routes now require a valid session and domain-appropriate permission by default instead of relying on UI-only checks
- Exact fix recommendation: keep refining the permission map as routes are split into domain routers
- Confidence level: High

### 6. Terminal panel — backend-supported commands + persistent presets **[RESOLVED]**
- Feature group: Automation, terminal, and debugging
- Severity: Low
- Files: [client/src/components/panels/TerminalCommandsPanel.tsx](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/components/panels/TerminalCommandsPanel.tsx), [server/services/TerminalCommandPresetService.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/server/services/TerminalCommandPresetService.ts)
- Related components/functions/routes: `isBackendSupportedTerminalCommand`, `GET/PUT /api/terminal-commands`
- Root cause: N/A — commands filtered; presets persisted in `terminal_command_presets` (DB). Panel uses backend instead of localStorage.

### 7. Per-drone command lease with UI display **[RESOLVED]**
- Feature group: Core flight operations, security
- Severity: Low
- Files: [client/src/components/controls/ControlDeck.tsx](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/components/controls/ControlDeck.tsx), [client/src/lib/api.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/lib/api.ts), [server/routes.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/server/routes.ts)
- Related components/functions/routes: `commandsApi.getLease`, `GET /api/commands/lease`, `POST /api/commands/dispatch` (409 on lease conflict)
- Root cause: N/A, implemented 2026-03-14
- Why it matters: ControlDeck polls lease status and displays "Controlled by {user}" when another operator holds the drone; controls are disabled in that state
- Confidence level: High

## C. Broken Features
### 1. Server-side readiness is broken for multi-instance mission/audio/firmware state
- Feature group: Multi-user, synchronization, reliability
- Severity: High
- Files: [server/routes.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/server/routes.ts#L137), [server/routes.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/server/routes.ts#L157), [server/routes.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/server/routes.ts#L162), [server/routes.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/server/routes.ts#L186), [server/routes.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/server/routes.ts#L1859)
- Related components/functions/routes: `missionRuns`, `automationRuns`, `serialPassthroughState`, `rtkNtripState`, `gpsInjectState`, `firmwareState`, `calibrationState`, `mappingState`, `audioState`
- Root cause: route-local process memory is still the source of truth for active operational state, with a JSON snapshot only reducing restart loss.
- Why it matters: second instance diverges, crash recovery is partial, and websocket state cannot be reconstructed safely from a durable authority.
- Exact fix recommendation: move runtime state into a durable state service backed by database rows or Firebase documents keyed by drone and operation.
- Confidence level: High

### 2. ~~Automation recipes remain browser-local and not backend-shared~~ **RESOLVED**
- Feature group: Automation, terminal, and debugging
- Severity: High → Resolved
- Files: [client/src/components/panels/AutomationPanel.tsx](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/components/panels/AutomationPanel.tsx), [server/routes.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/server/routes.ts), [server/services/AutomationService.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/server/services/AutomationService.ts)
- Related components/functions/routes: `GET/POST/PATCH/DELETE /api/automation/scripts`, `/api/automation/scripts/execute`, `AutomationService.getRecipes/createRecipe/updateRecipe/deleteRecipe`
- Root cause: N/A — remediated. Recipes now persisted in `automation_recipes` table; panel fetches from and writes to backend; `lastRun` updated on successful execute.
- Confidence level: High

## D. Partially Implemented Features

### 1. Control deck arm/disarm state now waits on telemetry truth, but only when telemetry exposes armed status
- Feature group: Core flight operations
- Severity: Medium
- Files: [client/src/components/controls/ControlDeck.tsx](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/components/controls/ControlDeck.tsx#L41), [client/src/components/controls/ControlDeck.tsx](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/components/controls/ControlDeck.tsx#L414), [client/src/lib/commandService.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/lib/commandService.ts#L16)
- Related components/functions/routes: `dispatchBackendCommand`, telemetry `armed`
- Root cause: browser-local armed storage was removed, but the final truth still depends on telemetry carrying `armed`.
- Why it matters: safer than the previous optimistic path, but still incomplete if a telemetry source omits armed state.
- Exact fix recommendation: add an explicit FC state endpoint or heartbeat field for armed status wherever telemetry is incomplete.
- Confidence level: High

### 2. Mission execution is real, but state durability and ownership are incomplete
- Feature group: Core flight operations
- Severity: High
- Files: [server/routes.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/server/routes.ts#L3831), [client/src/components/panels/MissionPlanningPanel.tsx](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/components/panels/MissionPlanningPanel.tsx)
- Related components/functions/routes: `/api/missions/:id/execute`, `/api/missions/runs/:runId/*`
- Root cause: mission validation, upload, start, and stop exist, but mission run state is mostly in memory and not clearly tied to authenticated ownership or durable telemetry progress.
- Why it matters: active mission supervision is fragile across restart and multi-operator use.
- Exact fix recommendation: persist mission runs, bind them to drone and operator, and update progress from a durable telemetry/FC progress stream.
- Confidence level: High

### 3. Telemetry display has real event fanout but weak authority
- Feature group: Core flight operations
- Severity: Medium
- Files: [client/src/components/layout/TopBar.tsx](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/components/layout/TopBar.tsx#L214), [client/src/contexts/TelemetryContext.tsx](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/contexts/TelemetryContext.tsx), [server/routes.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/server/routes.ts#L8257)
- Related components/functions/routes: websocket telemetry events, `/api/telemetry/record`, `TelemetryProvider`
- Root cause: frontend telemetry state is propagated through global window events and `window.__currentTelemetry`; no clear durable telemetry model is exposed to the client.
- Why it matters: stale snapshots, hidden coupling, and weak replay/debuggability.
- Exact fix recommendation: use a single telemetry store keyed by drone, fed by websocket and backed by recent server snapshots.
- Confidence level: High

### 4. ~~Messaging is implemented, but still mixed with browser-local backup state~~ **[RESOLVED]**
- Feature group: Audio and communications
- Severity: ~~Medium~~ N/A
- **Status**: TopBar uses server as source of truth; fetches from `/api/messages`, no `localStorage` backup for messages. Websocket events update local state but do not persist to localStorage.

### 5. ~~Offline sync exists, but queue ownership is split~~ **[RESOLVED — dead code removed]**
- Feature group: Offline-first, backup, and cloud sync
- Severity: ~~Medium~~ N/A
- **Status**: `useOfflineSync.ts` was never imported; removed 2026-03-14. Backend `/api/backlog/*` endpoints remain. No active client offline sync path.

### 6. ~~Camera settings not drone-scoped~~ **[RESOLVED]**
- Feature group: Camera, media, and payload
- Severity: ~~Medium~~ N/A
- **Status**: `GET/PATCH /api/camera-settings?droneId=` and `camera_settings_map.json` / DB `droneId` column. VideoFeed passes `selectedDrone?.id` when loading and saving.

### 6. Video/media capture — device source now explicit **[RESOLVED — disclaimer added]**
- Feature group: Camera, media, and payload
- Severity: ~~Medium~~ Mitigated
- **Status**: VideoFeed shows "LAPTOP CAM (Browser capture)" for webcam; "(Demo — not live drone feed)" when placeholder; "(Drone camera)" when live. Device source is explicit.

### 7. Speaker/audio panel is wired, but relies on polling plus transient route state
- Feature group: Audio and communications
- Severity: Medium
- Files: [client/src/components/panels/SpeakerPanel.tsx](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/components/panels/SpeakerPanel.tsx), [server/routes.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/server/routes.ts#L2060)
- Related components/functions/routes: `/api/audio/*`, websocket audio events
- Root cause: output selection, live audio, TTS, buzzer, and drone mic routes exist, but state is backed by in-memory `audioState` and refreshed partly by polling.
- Why it matters: restart loses state and multi-client coherence is weak.
- Exact fix recommendation: persist audio session state and remove polling where websocket truth already exists.
- Confidence level: High

### 8. Geofencing and mission airspace validation are implemented, but final FC truth is not durable
- Feature group: Map, navigation, and airspace
- Severity: Medium
- Files: [client/src/components/panels/GeofencingPanel.tsx](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/components/panels/GeofencingPanel.tsx), [client/src/components/panels/MissionPlanningPanel.tsx](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/components/panels/MissionPlanningPanel.tsx#L1019), [server/routes.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/server/routes.ts#L2841), [server/routes.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/server/routes.ts#L3831)
- Related components/functions/routes: fence upload/download, mission upload/validate/diff, live/static airspace queries
- Root cause: the UI and backend call real routes, but final flight-controller state is not persisted in a durable control model.
- Why it matters: a second operator cannot reliably inspect the actual last-applied fence/mission state from backend truth alone.
- Exact fix recommendation: store last uploaded fence hash, mission hash, FC download snapshot, and diff results per drone.
- Confidence level: Medium

### 9. ~~Tracking panel is sophisticated browser ML, not a verified drone tracking subsystem~~ **[RESOLVED — disclaimer added]**
- Feature group: Object recognition and tracking
- Severity: ~~Medium~~ Mitigated
- **Status**: Panel already shows "Browser demo mode" vs "Onboard tracking" badge. Added explicit disclaimer (2026-03-14): "Runs in-browser with TensorFlow.js COCO-SSD — not a verified onboard drone tracking subsystem."
- Root cause: tracking is performed locally in-browser; no proved backend/device bridge. UI now clearly distinguishes modes.
- Confidence level: High

### 10. ~~3D mapping lightweight without production pipeline~~ **[RESOLVED — production pipeline]**
- Feature group: 3D mapping / reconstruction
- Severity: ~~Medium~~ Resolved
- **Status**: Production mapping pipeline — Mapping3DService with DB persistence (`mapping_3d_sessions`, `mapping_3d_models`), PLY export, `GET /api/mapping/3d/models`, `GET /api/mapping/3d/model/:id/ply`. State survives restarts when USE_DB.

## E. Not Verifiable From Provided Code

- Actual flight controller response, motor state, and sensor state for MAVLink routes under [server/routes.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/server/routes.ts)
- Real servo/gripper actuation outcome for `/api/servo/control`
- Real BME688 hardware integration beyond script invocation and route shape
- Real RTK/NTRIP and GPS injection behavior against hardware radios and GPS
- Real firmware flashing success and bootloader recovery on target FC hardware
- Real cloud account configuration and Firebase/Google runtime behavior
- Real drone camera, microphone, payload, and live audio hardware paths

## F. Duplicate / Redundant Systems

### 1. Browser-local state duplicates backend truth
- Feature group: Architecture
- Severity: High
- Files: [client/src/components/video/VideoFeed.tsx](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/components/video/VideoFeed.tsx#L122), [client/src/components/controls/ControlDeck.tsx](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/components/controls/ControlDeck.tsx#L41)
- Related components/functions/routes: `mouse_offline_backlog` (automation scripts now backend-owned; messages now server-owned)
- Root cause: several flows still use `localStorage` as active state rather than only transient UX cache, even though camera settings, armed state, messages, and automation recipes were moved off that path.
- Why it matters: duplicate sources of truth break multi-user and multi-device sync.
- Exact fix recommendation: keep browser storage for preferences only. Operational state must be backend-owned.
- Confidence level: High

### 2. Telemetry fanout is duplicated through websocket, DOM events, and browser globals
- Feature group: Core flight operations
- Severity: Medium
- Files: [client/src/components/layout/TopBar.tsx](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/components/layout/TopBar.tsx#L214), [client/src/contexts/TelemetryContext.tsx](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/contexts/TelemetryContext.tsx), [client/src/components/navigation/GpsDeniedNavigationController.tsx](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/components/navigation/GpsDeniedNavigationController.tsx)
- Related components/functions/routes: websocket telemetry messages, `telemetry-update`, `window.__currentTelemetry`
- Root cause: no single typed client-side telemetry store
- Why it matters: repeated listeners and stale reads are likely
- Exact fix recommendation: centralize telemetry in one store and remove window-global fallback access
- Confidence level: High

### 3. Audit report file naming is duplicated by case
- Feature group: Maintainability
- Severity: Low
- Files: [AUDIT_REPORT.md](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/AUDIT_REPORT.md)
- Related components/functions/routes: report artifact naming
- Root cause: repo references both `AUDIT_REPORT.md` and `Audit_report.md` in prior work; on case-insensitive filesystems this collides silently.
- Why it matters: confusing tooling and diff history
- Exact fix recommendation: standardize on one exact filename
- Confidence level: High

## G. Data Sync / Multi-User Issues

### 1. Selected drone is not server-scoped
- Feature group: Drone and fleet management
- Severity: Medium
- Files: [client/src/contexts/AppStateContext.tsx](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/contexts/AppStateContext.tsx), [client/src/lib/clientState.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/lib/clientState.ts)
- Root cause: selected drone is centralized on the frontend, but it remains browser-local
- Why it matters: two operator devices for the same user can diverge
- Exact fix recommendation: persist operator session preferences on the backend
- Confidence level: High

### 2. Mission and automation run visibility is process-scoped
- Feature group: Core flight operations
- Severity: High
- Files: [server/routes.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/server/routes.ts#L137), [server/routes.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/server/routes.ts#L157)
- Root cause: in-memory maps back active runs
- Why it matters: multi-instance or restart loses shared truth
- Exact fix recommendation: persist runs in the database and publish from that source
- Confidence level: High

### 3. ~~Message user presence leaks through unauthenticated endpoint~~ **[RESOLVED]**
- Feature group: Audio and communications
- Severity: ~~Medium~~ N/A
- **Status**: `/api/chat-users` now protected with `requireAuth` (2026-03-14).

## H. Security Issues

### 1. Client permissions are not a valid trust boundary
- Feature group: Security
- Severity: Critical
- Files: [client/src/hooks/usePermissions.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/hooks/usePermissions.ts), [server/routes.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/server/routes.ts)
- Related components/functions/routes: many panels hide controls, but backend routes remain callable directly
- Root cause: UI checks exist without corresponding route protection on large parts of the API
- Why it matters: privilege escalation by direct HTTP call
- Exact fix recommendation: put permission middleware on every write route and sensitive read route
- Confidence level: High

### 2. Local JSON auth and data stores are easier to tamper with than a database-backed system
- Feature group: Security
- Severity: High
- Files: [server/authStore.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/server/authStore.ts), [server/storage.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/server/storage.ts)
- Root cause: flat-file storage for users and operational entities
- Why it matters: weak auditability, weak concurrent integrity, accidental corruption risk
- Exact fix recommendation: move auth and operational records to a real datastore
- Confidence level: High

### 3. Broad monolithic route file increases authorization drift risk
- Feature group: Security
- Severity: Medium
- Files: [server/routes.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/server/routes.ts)
- Root cause: one file mixes auth, business logic, device control, cloud sync, and debug endpoints
- Why it matters: easy to forget middleware on new routes
- Exact fix recommendation: split by domain routers and attach default middleware at router level
- Confidence level: High

## I. Reliability / Silent Failure Risks

### 1. Many flows acknowledge dispatch, not outcome
- Feature group: Reliability
- Severity: High
- Files: [client/src/lib/commandService.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/lib/commandService.ts), [client/src/components/controls/ControlDeck.tsx](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/components/controls/ControlDeck.tsx)
- Root cause: command ack is treated as a completed result in parts of the UI
- Why it matters: flight UI may claim success before the aircraft actually transitions state
- Exact fix recommendation: split `accepted`, `executing`, `confirmed`, and `failed` states and drive final UI from telemetry or downstream ack
- Confidence level: High

### 2. Firmware and mapping jobs can vanish across restart
- Feature group: Reliability
- Severity: High
- Files: [server/routes.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/server/routes.ts#L186), [server/routes.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/server/routes.ts#L1869)
- Root cause: in-memory job state
- Why it matters: operators lose active job visibility
- Exact fix recommendation: persist job rows and recover them at startup
- Confidence level: High

### 3. ~~`useOfflineSync` still relies on browser staging~~ **[RESOLVED — dead code removed]**
- Feature group: Reliability
- Severity: ~~Medium~~ N/A
- **Status**: `useOfflineSync.ts` removed 2026-03-14 (was never imported). No active client offline sync path.

## J. Performance Issues

### 1. Whole-file JSON rewrites for core entities
- Feature group: Performance
- Severity: High
- Files: [server/storage.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/server/storage.ts)
- Root cause: read-modify-write of full arrays
- Why it matters: O(n) writes and no transactional concurrency
- Exact fix recommendation: move to normalized database tables/collections
- Confidence level: High

### 2. Polling overlaps realtime in several panels
- Feature group: Performance
- Severity: Medium
- Files: [client/src/components/panels/SpeakerPanel.tsx](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/components/panels/SpeakerPanel.tsx#L166), [client/src/components/panels/DroneSelectionPanel.tsx](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/components/panels/DroneSelectionPanel.tsx), [client/src/components/panels/SettingsPanel.tsx](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/components/panels/SettingsPanel.tsx#L1691)
- Root cause: polling stays active even where websocket or explicit status transitions already exist
- Why it matters: unnecessary load and race-prone UI state
- Exact fix recommendation: prefer push updates and bounded retry loops
- Confidence level: Medium

### 3. Many independent browser event listeners and `localStorage` reads
- Feature group: Performance
- Severity: Medium
- Files: [client/src/components/layout/TopBar.tsx](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/components/layout/TopBar.tsx), [client/src/components/controls/ControlDeck.tsx](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/components/controls/ControlDeck.tsx), [client/src/components/video/VideoFeed.tsx](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/components/video/VideoFeed.tsx)
- Root cause: partial centralization only
- Why it matters: harder to optimize rerenders and reasoning
- Exact fix recommendation: continue consolidating around `AppStateContext`, React Query, and a single telemetry store
- Confidence level: High

## K. Architecture / Maintainability Issues

### 1. `server/routes.ts` is too large and owns too many concerns
- Feature group: Architecture
- Severity: High
- Files: [server/routes.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/server/routes.ts)
- Root cause: auth, device control, persistence orchestration, websocket logic, cloud sync, and debug logic are all colocated
- Why it matters: hard to review safely and easy to regress
- Exact fix recommendation: split into routers and domain services
- Confidence level: High

### 2. Operational state is spread across backend files, Firebase sync, browser storage, and DOM events
- Feature group: Architecture
- Severity: High
- Files: [server/storage.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/server/storage.ts), [server/sessionStore.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/server/sessionStore.ts), [client/src/lib/clientState.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/lib/clientState.ts), [client/src/components/layout/TopBar.tsx](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/components/layout/TopBar.tsx)
- Root cause: architectural drift
- Why it matters: no single authoritative mental model
- Exact fix recommendation: define source-of-truth ownership per domain and enforce it
- Confidence level: High

## L. High-Priority Fixes

1. Move mission run, audio, firmware, RTK, calibration, and mapping state out of route-local memory.
2. Replace file-backed JSON operational storage with a real database-backed model.
3. Make automation recipes backend-owned and multi-user visible.
4. Replace remaining browser-local operational state for messages and offline sync with backend-owned state.
5. Scope camera settings and other operational preferences by drone/session.

## M. Recommended Refactors

1. Split [server/routes.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/server/routes.ts) into:
   - `authRoutes`
   - `fleetRoutes`
   - `missionRoutes`
   - `telemetryRoutes`
   - `mediaRoutes`
   - `audioRoutes`
   - `debugRoutes`
   - `pluginRoutes`
2. Create services:
   - `MissionExecutionService`
   - `TelemetryService`
   - `AudioSessionService`
   - `FirmwareJobService`
   - `OperatorPreferenceService`
   - `OfflineBacklogService`
3. Normalize persistence:
   - `users`
   - `sessions`
   - `groups`
   - `drones`
   - `drone_configs`
   - `missions`
   - `waypoints`
   - `mission_runs`
   - `flight_sessions`
   - `flight_logs`
   - `sensor_samples`
   - `motor_telemetry`
   - `media_assets`
   - `commands`
   - `audio_sessions`
   - `offline_backlog`
4. Treat Firebase and Google integrations as replication/integration layers, not primary authority.

## N. Deep Audit Supplement (2026-03-14)

### N1. Dead Code / Orphaned Files

| File | Status | Evidence |
| --- | --- | --- |
| ~~client/src/hooks/useOfflineSync.ts~~ | **REMOVED** | Dead code removed 2026-03-14. Never imported. |
| [client/public/opengraph.jpg](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/public/opengraph.jpg) | **N/A** | File does not exist; repo has `opengraph.png` only. |
| ~~attached_assets/Logo/Background removed logo.png~~ | **REMOVED** | Removed 2026-03-14. |
| ~~attached_assets/Logo/logo with white BG.png~~ | **REMOVED** | Removed 2026-03-14. |

### N2. Backend Endpoints Unused by Client

No client `fetch` or API call found for:

- ~~`GET /api/commands/lease`~~ **RESOLVED** — ControlDeck polls and displays "Controlled by {user}" (2026-03-14).
- `GET /api/cloud/awareness`
- `GET /api/cloud/admin-dashboard`
- `POST /api/cloud/commands/dispatch`
- `POST /api/cloud/commands/:id/ack`
- `GET /api/cloud/commands`
- `POST /api/cloud/telemetry/ingest`
- `GET /api/cloud/telemetry/live`
- `GET /api/integrations/verify`
- `GET /api/automation/runs`
- `GET /api/commands/:id`
- `GET /api/servo/status`
- `GET /api/google/configured`
- `POST /api/messages/sync`

### N3. Python Script Usage (All Referenced)

All 13 scripts in `scripts/` are invoked by `server/routes.ts` or `server/index.ts`:

| Script | Used By |
| --- | --- |
| `mavlink_params.py` | params CRUD, import, export, compare |
| `mavlink_vehicle_control.py` | vehicle action, manual control |
| `servo_control.py` | gripper open/close, `/api/servo/control` |
| `mavlink_mission.py` | mission upload/download/validate/diff |
| `mavlink_fence.py` | fence upload/download |
| `mavlink_rally.py` | rally upload/download |
| `mavlink_calibration.py` | calibration start/cancel |
| `mavlink_inspector.py` | inspector snapshot/live |
| `mavlink_firmware.py` | firmware flash, recover |
| `mavlink_dataflash.py` | dataflash list/download/analyze/replay |
| `mavlink_geotag.py` | geotag run |
| `bme688_monitor.py` | BME688 read/status/debug |
| `runtime_bootstrap.py` | server startup |

### N4. Operator Preference Service

`operatorPreferenceService` is used in [server/routes.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/server/routes.ts) around lines 7350–7362 for `/api/operator/preferences` (GET/PATCH). Client calls via [client/src/lib/api.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/lib/api.ts) (lines 91, 95). Preferences are in-memory; not durable across server restart.

### N5. Offline Backlog Path

- Backend: `/api/backlog/sync`, `/api/backlog/clear`, `/api/backlog` exist and are called only from `useOfflineSync`.
- Since `useOfflineSync` is never imported, **no client ever triggers offline backlog sync**. The backend path is orphaned from a client perspective.

### N6. Command Lease Implementation

- Per-drone command lease is implemented: `commandLeases` map, `getCommandLease`, `acquireCommandLease`, 2-minute TTL.
- Dispatch returns 409 when another user holds the lease; client surfaces `data.error` via `throw new Error(data?.error)`.
- `GET /api/commands/lease?connectionString=...` exists but is not called by the client; ControlDeck does not display "controlled by X" before attempting commands.

### N7. UI Component Usage

Radix UI components (accordion, alert-dialog, aspect-ratio, avatar, button-group, calendar, carousel, context-menu, drawer, dropdown-menu, hover-card, input-group, input-otp, menubar, navigation-menu, pagination, toggle-group) exist; usage varies. Some may be transitively imported or reserved for future use. Do not delete without verifying imports.

### N8. Recent Remediation Additions (Post-Audit)

- **BME688**: Production gate — returns 503 when not on Pi.
- **Connection test**: Returns `success: false` when simulated in production.
- **Telemetry fallback**: "SIM" badge when `source === 'sim'`.
- **Arm state**: `arm-state-changed` dispatched from TelemetryContext when telemetry has `armed`; TelemetryPanel no longer initializes from localStorage.
- **Automation**: Relabeled as "Rule-based command mapping".
- **Command lease**: Per-drone lease enforced on dispatch.

## Feature Audit Matrix

| Feature Group | Feature Name | UI Present? | Frontend Wired? | Backend Exists? | Backend Used? | Database/Persistence Wired? | Real Device/System Integration? | Multi-User Safe? | Secure? | Status | Issue Summary |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Core flight operations | Real-time telemetry display | Yes | Partial | Partial | Partial | Partial | Not Verifiable | Partial | Partial | Partial | WS fanout exists, but client authority is DOM events and browser globals |
| Core flight operations | Arm/disarm | Yes | Yes | Yes | Yes | No | Not Verifiable | No | No | Partial | Command dispatch exists but state confirmation is optimistic and route protection is weak |
| Core flight operations | Mode changes | Yes | Yes | Yes | Yes | No | Not Verifiable | No | No | Partial | Device route exists, but many relevant routes lack auth and durable state |
| Core flight operations | Manual control | Yes | Yes | Yes | Yes | N/A | Not Verifiable | No | No | Partial | Backend route exists, no durable acknowledgement model |
| Core flight operations | MAVLink command dispatch | Yes | Yes | Yes | Yes | Partial | Not Verifiable | Partial | No | Partial | Some routes use command service, others bypass it |
| Core flight operations | Mission create/edit/delete | Yes | Yes | Yes | Yes | Yes | N/A | Partial | No | Partial | CRUD exists but not server-protected consistently |
| Core flight operations | Mission upload/download/validate/diff | Yes | Yes | Yes | Yes | Partial | Not Verifiable | Partial | No | Partial | Real routes exist but no durable FC truth model |
| Core flight operations | Mission run start/track/stop/complete | Yes | Yes | Yes | Yes | Partial | Not Verifiable | No | Partial | Partial | Active state mostly in memory |
| Core flight operations | Flight mode mapping | Yes | Yes | Yes | Yes | Partial | Not Verifiable | Partial | No | Partial | Real route usage, weak auth and no durable applied-state record |
| Core flight operations | Vehicle setup / airframe profile | Yes | Yes | Yes | Yes | Partial | Not Verifiable | Partial | No | Partial | Route bridge exists, actual hardware outcome not proved |
| Map/navigation | Interactive map / positions / overlays | Yes | Yes | Partial | Partial | Partial | Partial | Partial | Partial | Partial | UI is rich, position authority is still weakly centralized |
| Map/navigation | No-fly zone overlays | Yes | Yes | Yes | Yes | N/A | Partial | Partial | Partial | Working | Static and queried overlays are wired, though source freshness varies |
| Map/navigation | Regulatory GeoJSON overlays | Yes | Yes | N/A | N/A | N/A | N/A | Yes | Yes | Working | Static asset overlays are browser-local and deterministic |
| Map/navigation | Airspace queries / TFR / sources | Yes | Yes | Yes | Yes | N/A | Partial | Partial | Partial | Partial | Routes exist and are used, but provider behavior is external |
| Map/navigation | Geocode / reverse geocode | Yes | Yes | Yes | Yes | N/A | Partial | Partial | Partial | Partial | Wired, external-provider reliability not fully shown |
| Map/navigation | GPS-denied nav panel | Yes | Partial | Partial | Partial | Local only | Not Verifiable | No | Partial | Partial | Strong UI, but core behavior is mostly local config and inferred telemetry |
| Map/navigation | Breadcrumb / route visualization | Yes | Partial | No | No | Local only | N/A | No | Yes | Partial | Browser-local breadcrumb persistence only |
| Object recognition | Video feed UI with HUD | Yes | Yes | Partial | Partial | Partial | Not Verifiable | No | Partial | Partial | Browser video and overlays work; actual drone feed path not proved |
| Object recognition | Object recognition / tracking panel | Yes | Yes | No | No | Local only | No | No | Partial | Partial | Browser TensorFlow/webcam path only |
| Object recognition | TensorFlow detection | Yes | Yes | No | No | Local only | No | No | Yes | Working | Local browser inference is implemented |
| Object recognition | Target locking / confidence tracking | Yes | Yes | No | No | Local only | No | No | Yes | Partial | Operates locally only, not flight-system integrated |
| Object recognition | Tracking to stabilization/nav alerts | Yes | Partial | Partial | Partial | Local only | Not Verifiable | No | Partial | Partial | Custom events exist, real flight linkage is not proved |
| Stabilization/safety | Auto stabilization controller | Yes | Partial | Yes | Partial | Partial | Not Verifiable | No | No | Partial | UI/controller exists, actual closed-loop outcome not proved |
| Stabilization/safety | ML stabilization engine | Yes | Partial | Partial | Partial | Local only | Not Verifiable | No | Partial | Partial | Mostly client-local model/config behavior |
| Stabilization/safety | Actuator bridge | Yes | Yes | Yes | Yes | No | Not Verifiable | No | No | Partial | Real route call, but no durable actuator state |
| Stabilization/safety | Emergency protocol controller | Yes | Partial | Partial | Partial | No | Not Verifiable | No | No | Partial | UI path exists, backend enforcement depth unclear |
| Stabilization/safety | Stabilization panel APIs | Yes | Yes | Yes | Yes | Partial | Not Verifiable | Partial | No | Partial | APIs exist, real hardware behavior not verifiable |
| Stabilization/safety | Telemetry-loss / low-battery failsafe flows | Yes | Partial | Partial | Partial | Local only | Not Verifiable | No | Partial | Partial | Automation rules react locally, not a durable backend failsafe engine |
| Stabilization/safety | Geofencing MAVLink upload/download | Yes | Yes | Yes | Yes | Partial | Not Verifiable | Partial | No | Partial | Real route use, weak auth and limited durability |
| User management | Login/logout/session validation | Yes | Yes | Yes | Yes | Yes | N/A | Partial | Partial | Working | Good base implementation |
| User management | Session token hydration on startup | Yes | Yes | Yes | Yes | Partial | N/A | Partial | Partial | Working | Client hydrates from backend session |
| User management | Admin user management | Yes | Yes | Yes | Yes | Yes | N/A | Partial | Yes | Working | Best-enforced admin domain in app |
| User management | Role-based permissions | Yes | Yes | Yes | Partial | Yes | N/A | Partial | Partial | Partial | Shared permission model exists, but many routes still bypass enforcement |
| User management | Group management | Yes | Yes | Yes | Yes | Yes | N/A | Partial | Yes | Working | Wired and protected |
| User management | User access panel | Yes | Yes | Yes | Yes | Yes | N/A | Partial | Partial | Working | Panel is wired to real auth/admin APIs |
| User management | Server-side permission enforcement | Partial | N/A | Partial | Partial | N/A | N/A | Partial | No | Broken | Present only on some routes |
| Drone/fleet | Multi-drone CRUD | Yes | Yes | Yes | Yes | Yes | N/A | Partial | No | Partial | Centralized backend path now exists, but route protection is weak |
| Drone/fleet | Drone selection panel | Yes | Yes | Yes | Yes | Partial | N/A | No | Partial | Partial | Frontend centralized, not server-scoped |
| Drone/fleet | Drone status/location updates | Yes | Partial | Yes | Partial | Yes | Partial | Partial | No | Partial | WS invalidation exists, authoritative location source still weak |
| Drone/fleet | Swarm operations | Yes | Yes | Yes | Yes | Partial | Not Verifiable | No | No | Partial | Backend routes exist, auth and real hardware execution are weakly proved |
| Drone/fleet | Cloud awareness/admin dashboard | Partial | No | Yes | No | Partial | Partial | Partial | Partial | Broken | Backend exists, no client usage found |
| Logs/history | Flight logs panel / replay | Yes | Yes | Yes | Yes | Yes | Partial | Partial | No | Partial | Real routes and storage exist, but auth gaps remain |
| Logs/history | Flight logbook panel | Yes | Yes | Yes | Yes | Yes | N/A | Partial | No | Partial | Wired, but persistence still file-backed and unprotected |
| Logs/history | Flight session lifecycle | Yes | Yes | Yes | Yes | Yes | N/A | Partial | No | Partial | Working path, but weak auth and file-backed persistence |
| Logs/history | DataFlash list/download/analyze/replay | Yes | Yes | Yes | Yes | Partial | Not Verifiable | Partial | No | Partial | Backend bridge exists, hardware/file availability external |
| Logs/history | Telemetry record ingest/retrieval | Partial | Partial | Yes | Partial | Yes | Partial | Partial | No | Partial | Backend exists, client use is indirect and weakly centralized |
| Logs/history | Motor telemetry / sensor history APIs | Partial | Partial | Yes | Partial | Yes | Not Verifiable | Partial | No | Partial | APIs exist, complete UI usage is limited |
| Camera/media | Camera settings read/update | Yes | Yes | Yes | Yes | Yes | Not Verifiable | Partial | Partial | Partial | Main video UI uses backend settings now, but settings are not yet drone-scoped |
| Camera/media | Media asset CRUD | Partial | Partial | Yes | Partial | Yes | N/A | Partial | No | Partial | Metadata writes exist; retrieval UX is incomplete |
| Camera/media | Media by drone/session lookup | Partial | Partial | Yes | Partial | Yes | N/A | Partial | No | Partial | Backend exists, limited client surfacing |
| Camera/media | Cloud media upload / pending sync | Yes | Yes | Yes | Yes | Yes | Partial | Partial | Partial | Partial | Drive/cloud upload + metadata exist, final cloud state external |
| Camera/media | Servo control/status | Partial | Partial | Yes | Partial | Partial | Not Verifiable | Partial | No | Partial | Control route exists; status route has no client usage found |
| Camera/media | Video feed and capture UI | Yes | Yes | Partial | Partial | Partial | Not Verifiable | No | Partial | Partial | Browser-side capture works; real drone camera not proved |
| Audio/comms | Audio session status / join / leave | Yes | Yes | Yes | Yes | Partial | Not Verifiable | Partial | Partial | Partial | Wired, but state is in-memory and not durable |
| Audio/comms | Audio output device selection | Yes | Yes | Yes | Yes | Partial | Not Verifiable | Partial | Partial | Partial | Real route use with in-memory authority |
| Audio/comms | Buzzer trigger | Yes | Yes | Yes | Yes | Partial | Not Verifiable | Partial | Partial | Partial | UI wired, real buzzer result not proved |
| Audio/comms | Text-to-speech | Yes | Yes | Yes | Yes | Partial | Not Verifiable | Partial | Partial | Partial | Route exists and UI uses it, no durable session state |
| Audio/comms | Live audio start/stop | Yes | Yes | Yes | Yes | Partial | Not Verifiable | Partial | Partial | Partial | Works at route level, fragile state model |
| Audio/comms | Drone microphone route/status | Yes | Yes | Yes | Yes | Partial | Not Verifiable | Partial | Partial | Partial | Wired, still in-memory |
| Audio/comms | Team messaging CRUD | Yes | Yes | Yes | Yes | Yes | N/A | Partial | Partial | Partial | Good core path, but local backup duplicates state |
| Audio/comms | Chat user presence endpoint | No | N/A | Yes | Partial | Yes | N/A | Partial | No | Partial | Endpoint exists and is used as fallback, but it leaks unauthenticated user info |
| Environment/sensors | BME688 panel | Yes | Yes | Yes | Yes | Partial | Not Verifiable | Partial | No | Partial | UI and routes exist, hardware proof absent |
| Environment/sensors | Sensor data recording/recent retrieval | Partial | Partial | Yes | Partial | Yes | Not Verifiable | Partial | No | Partial | APIs exist, broader end-to-end use is limited |
| Calibration/tools | Calibration panel | Yes | Yes | Yes | Yes | Partial | Not Verifiable | Partial | No | Partial | Start/cancel/status are real, state is in-memory |
| Calibration/tools | FC parameter browser/editor | Yes | Yes | Yes | Yes | Partial | Not Verifiable | Partial | Partial | Partial | Real routes and UI exist, durability is still weak |
| Calibration/tools | Parameter import/export/compare | Yes | Yes | Yes | Yes | Partial | Not Verifiable | Partial | No | Partial | Wired to backend bridges |
| Calibration/tools | MAVLink inspector snapshot/live | Yes | Yes | Yes | Yes | No | Not Verifiable | No | No | Partial | Real bridge, no durable state |
| Calibration/tools | Rally point upload/download | Yes | Yes | Yes | Yes | Partial | Not Verifiable | Partial | No | Partial | Route/UI path exists |
| Calibration/tools | Serial passthrough | Yes | Yes | Yes | Yes | No | Not Verifiable | No | No | Partial | In-memory status only |
| Calibration/tools | SiK radio status/query/apply/verify | Yes | Yes | Yes | Yes | Partial | Not Verifiable | Partial | No | Partial | Route/UI path exists, actual radio result external |
| Calibration/tools | RTK/NTRIP profiles and control | Yes | Yes | Yes | Yes | Partial | Not Verifiable | No | No | Partial | Some profile persistence, runtime state in memory |
| Calibration/tools | GPS injection controls | Yes | Yes | Yes | Yes | No | Not Verifiable | No | No | Partial | Runtime state in memory |
| Firmware/plugins | Firmware catalog CRUD | Yes | Yes | Yes | Yes | Partial | N/A | Partial | Partial | Partial | UI and backend exist, but jobs/catalog remain file-backed |
| Firmware/plugins | Firmware install/flash/recovery | Yes | Yes | Yes | Yes | Partial | Not Verifiable | No | No | Partial | Real route usage, in-memory job state |
| Firmware/plugins | Plugin listing/enablement/tool execution | Yes | Yes | Yes | Yes | Partial | Partial | Partial | Partial | Working | Best-bounded non-auth domain, still needs stronger auth |
| Firmware/plugins | Plugin SDK helpers | Yes | Yes | Yes | Yes | Partial | N/A | Partial | Partial | Working | Template/validate/package flows are wired |
| Automation/debug | Automation panel | Yes | Yes | Yes | Yes | Backend | Yes | Yes | Partial | Working | Recipes persisted in DB; CRUD via API |
| Automation/debug | Automation run history | Partial | No | Yes | No | No | N/A | No | Partial | Broken | Backend exists, no client usage found |
| Automation/debug | Terminal commands panel | Yes | Yes | Yes | Yes | Partial | No | No | Partial | Partial | Panel now filters to backend-supported commands only |
| Automation/debug | Generic command queue/history/detail | Partial | Partial | Yes | Partial | Partial | N/A | Partial | Partial | Partial | Dispatch used; list/detail endpoints appear unused by client |
| Automation/debug | Runtime config / connection test APIs | Yes | Yes | Yes | Yes | Partial | Partial | Partial | Partial | Partial | Wired in settings, actual network/device test external |
| Automation/debug | Debug event/system/probe endpoints | Yes | Yes | Yes | Yes | Partial | Partial | Partial | Partial | Working | Good admin/support tooling path |
| Automation/debug | Integration verification endpoint | Partial | No | Yes | No | N/A | Partial | Partial | Partial | Partial | Backend exists, no client usage found |
| Offline/cloud | Local JSON storage | N/A | N/A | Yes | Yes | Yes | N/A | No | Partial | Partial | Works, but not production-safe |
| Offline/cloud | Offline backlog queue and sync | Yes | Yes | Yes | Yes | Yes | N/A | No | Partial | Partial | Implemented but duplicate-owned |
| Offline/cloud | Offline sync idempotency | No | N/A | Yes | Yes | Yes | N/A | Partial | Partial | Working | Backend store exists and is test-covered |
| Offline/cloud | Google Sheets backup/status | Yes | Yes | Yes | Yes | Partial | Not Verifiable | Partial | Partial | Partial | UI and routes exist, external account dependency |
| Offline/cloud | Google Drive status/list/upload/delete | Yes | Yes | Yes | Yes | Partial | Not Verifiable | Partial | Partial | Partial | Real routes/UI, external provider dependency |
| Offline/cloud | Google OAuth account linking/switch/removal | Yes | Yes | Yes | Yes | Partial | Not Verifiable | Partial | Partial | Partial | Implemented, provider flow external |
| Offline/cloud | Firebase/cloud config/status/test/sync-all | Yes | Yes | Yes | Yes | Partial | Not Verifiable | Partial | Partial | Partial | Admin settings path exists |
| Offline/cloud | Cloud command dispatch/ack/list | No | No | Yes | No | Partial | Not Verifiable | Partial | Partial | Broken | Backend exists, no client usage found |
| Offline/cloud | Cloud telemetry ingest/live | No | No | Yes | No | Partial | Not Verifiable | Partial | Partial | Broken | Backend exists, no client usage found |
| Offline/cloud | Cloud awareness/admin dashboard | No | No | Yes | No | Partial | Not Verifiable | Partial | Partial | Broken | Backend exists, no client usage found |
| 3D mapping | 3D mapping APIs and home-page status | Yes | Yes | Yes | Yes | Partial | Partial | No | Partial | Partial | Usable preview feature, not a robust production mapping service |

## Button / Control Audit Table

| Page / Screen | Control Name | Expected Action | Actual Wiring Found | Backend/Device Path | Status | Issue Summary |
| --- | --- | --- | --- | --- | --- | --- |
| Home / TopBar | Send message | Send team or DM message | `fetch('/api/messages')` POST and websocket fanout | `/api/messages` | Working | Real create path exists |
| Home / TopBar | Edit message | Edit own/admin message | `fetch('/api/messages/:id')` PATCH | `/api/messages/:id` | Working | Real edit path exists |
| Home / TopBar | Delete message | Delete own/admin message | `fetch('/api/messages/:id')` DELETE | `/api/messages/:id` | Working | Real delete path exists |
| Home / TopBar | Logout | End session | `fetch('/api/auth/logout')` and clear local session | `/api/auth/logout` | Working | Real logout path exists |
| Drone Selection | Create drone | Add drone to fleet | mutation to `/api/drones` | `/api/drones` | Partial | Real CRUD path exists and now requires authenticated access |
| Drone Selection | Edit drone | Update drone config | mutation to `/api/drones/:id` | `/api/drones/:id` | Partial | Real CRUD path exists and now requires authenticated access |
| Drone Selection | Delete drone | Remove drone | mutation to `/api/drones/:id` | `/api/drones/:id` | Partial | Real CRUD path exists and now requires authenticated access |
| Drone Selection | Select drone | Change active drone | `AppStateContext.selectDrone` | client state only | Partial | Browser-local preference, not server-scoped |
| Control Deck | Arm/Disarm | Arm or disarm vehicle | `dispatchBackendCommand` then telemetry-driven state update | `/api/commands/dispatch` | Partial | Safer than before, but depends on telemetry exposing armed state |
| Control Deck | Takeoff | Trigger takeoff | `dispatchBackendCommand('takeoff')` | `/api/commands/dispatch` | Partial | Real dispatch, hardware outcome not proved |
| Control Deck | Return to base | RTL | `dispatchBackendCommand('rtl')` | `/api/commands/dispatch` | Partial | Real dispatch, no durable mission/control state |
| Control Deck | Emergency stop | Emergency action | local/UI command path | command route | Partial | Safety behavior not fully verifiable |
| Mission Planning | Save mission | Persist mission | mission mutation | `/api/missions` | Partial | Real CRUD path now sits behind centralized API auth |
| Mission Planning | Delete mission | Remove mission | mission delete mutation | `/api/missions/:id` | Partial | Real CRUD path now sits behind centralized API auth |
| Mission Planning | Upload mission to FC | Push mission | `fetch('/api/mavlink/mission/upload')` | mission bridge | Partial | Real bridge, FC outcome not verifiable |
| Mission Planning | Download mission from FC | Pull mission | `fetch('/api/mavlink/mission/download')` | mission bridge | Partial | Real bridge, FC outcome not verifiable |
| Mission Planning | Execute mission | Start mission run | `missionsApi.execute` | `/api/missions/:id/execute` | Partial | Real route, run state in memory |
| Geofencing | Upload fence | Push fence to FC | `fetch('/api/mavlink/fence/upload')` | fence bridge | Partial | Real route, FC truth not persisted |
| Geofencing | Download fence | Pull fence from FC | `fetch('/api/mavlink/fence/download')` | fence bridge | Partial | Real route, no durable last-known state |
| Mavlink Tools | Serial passthrough start/stop | Start local passthrough | `fetch('/api/mavlink/serial-passthrough/*')` | bridge process | Partial | Status is in-memory only |
| Mavlink Tools | Inspector snapshot/live | Inspect MAVLink traffic | `fetch('/api/mavlink/inspector/*')` | bridge script | Partial | Good path, no persistence |
| Mavlink Tools | Manual control | Send manual stick inputs | `fetch('/api/mavlink/manual-control')` | vehicle control bridge | Partial | Real route path now protected by centralized API auth |
| Mavlink Tools | SiK apply/verify/query | Radio tooling | dedicated fetches | SiK bridge routes | Partial | Real route usage, hardware result external |
| Calibration | Start calibration | Begin selected calibration | `fetch('/api/mavlink/calibration/start')` | calibration bridge | Partial | Runtime state in memory |
| Calibration | Cancel calibration | Cancel/reset | `fetch('/api/mavlink/calibration/cancel')` | calibration bridge | Partial | Runtime state in memory |
| RTK/NTRIP | Start/Stop | Control RTK stream | `fetch('/api/mavlink/rtk/start|stop')` | RTK process | Partial | Runtime state in memory |
| RTK/NTRIP | Reconnect | Reconnect RTK | `fetch('/api/mavlink/rtk/reconnect')` | RTK process | Partial | Runtime state in memory |
| RTK/NTRIP | GPS inject start/stop | Inject GPS data | `fetch('/api/mavlink/gps-inject/*')` | injector process | Partial | Runtime state in memory |
| Video Feed | Gimbal arrows/center | Move gimbal | `fetch('/api/mavlink/command')` | gimbal command route | Partial | Real route use, now auth-protected but still lacks durable applied state |
| Video Feed | Snapshot | Capture and save media | browser capture then drive/media calls | `/api/drive/upload`, `/api/media` | Partial | Works for browser capture, not proved for drone camera |
| Video Feed | Record | Record and save clip | browser `MediaRecorder` then drive/media calls | `/api/drive/upload`, `/api/media` | Partial | Browser recording path only |
| Speaker Panel | Select output | Change output device | debounced fetch | `/api/audio/output/select` | Partial | Real route use, in-memory state |
| Speaker Panel | TTS send | Broadcast TTS | fetch | `/api/audio/tts` | Partial | Real route use, hardware path external |
| Speaker Panel | Live start/stop | Start/stop live audio | fetch | `/api/audio/live/start|stop` | Partial | Real route use, state not durable |
| Speaker Panel | Drone mic enable | Manage drone mic | fetch | `/api/audio/drone-mic` | Partial | Real route use, state not durable |
| Speaker Panel | Buzzer | Trigger buzzer tone | fetch | `/api/audio/buzzer` | Partial | Real route use, hardware outcome external |
| Automation | Run script | Execute automation | `fetch('/api/automation/scripts/execute')` | regex-mapped command route | Partial | UI now labels these as recipes, but execution is still limited to mapped actions |
| Automation | Save script | Persist automation | `PATCH /api/automation/scripts/:id` | AutomationService | Working | Recipes persisted in DB |
| Terminal Commands | Run command | Execute listed terminal/system command | command dispatch | `/api/commands/dispatch` | Partial | Panel now exposes only backend-supported commands |
| Plugin Toolchain | Enable/Disable plugin | Toggle plugin state | fetch | `/api/plugins/:id/enable` | Working | Real route path exists |
| Plugin Toolchain | Run tool | Execute plugin tool | fetch | `/api/plugins/:id/run-tool` | Working | Bounded execution path |
| Plugin Toolchain | Validate/Package | SDK helper actions | fetch | `/api/plugins/sdk/*` | Working | Real route usage |
| Settings | Test cloud config | Validate cloud setup | fetch | `/api/cloud/test` | Partial | Real route use, external system dependency |
| Settings | Sync all cloud data | Push cloud sync | fetch | `/api/cloud/sync-all` | Partial | Real route use, external dependency |
| Settings | Firmware flash | Flash FC firmware | fetch + status poll | `/api/firmware/flash`, `/api/firmware/status` | Partial | Real route use, job state in memory |
| Settings | Bootloader recovery | Recover FC | fetch | `/api/firmware/recover-bootloader` | Partial | Real route use, hardware outcome external |

## Flow Traces

### Control deck actions
UI -> [client/src/components/controls/ControlDeck.tsx](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/components/controls/ControlDeck.tsx) button handlers -> [client/src/lib/commandService.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/lib/commandService.ts) `dispatchBackendCommand` -> `/api/commands/dispatch` in [server/routes.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/server/routes.ts#L3638) -> `CommandService.dispatchAndWait` + `executeUnifiedCommand` -> bridge script/device -> command ack -> browser `command-acked` event and local armed-state updates

### Mission execution
UI -> [client/src/components/panels/MissionPlanningPanel.tsx](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/components/panels/MissionPlanningPanel.tsx) execute action -> [client/src/lib/api.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/lib/api.ts) `missionsApi.execute` -> `/api/missions/:id/execute` in [server/routes.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/server/routes.ts#L3831) -> mission validation + airspace checks + upload bridge + command dispatch -> in-memory `missionRuns` + websocket broadcast -> UI polls run/status

### Telemetry ingestion
Device/system or backend caller -> `/api/telemetry/record` in [server/routes.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/server/routes.ts#L8257) -> storage append/broadcast -> websocket message -> [client/src/components/layout/TopBar.tsx](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/components/layout/TopBar.tsx#L214) normalizes and dispatches `telemetry-update` -> [client/src/contexts/TelemetryContext.tsx](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/contexts/TelemetryContext.tsx) updates shared context -> UI widgets rerender

### Messaging
UI -> [client/src/components/layout/TopBar.tsx](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/components/layout/TopBar.tsx) send/edit/delete handlers -> `/api/messages*` routes in [server/routes.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/server/routes.ts#L7413) -> [server/storage.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/server/storage.ts) message persistence + websocket smart broadcast + optional Sheets sync -> UI updates message list

### Cloud sync
UI -> [client/src/components/panels/SettingsPanel.tsx](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/components/panels/SettingsPanel.tsx) cloud actions -> `/api/cloud/config|status|test|sync-all` in [server/routes.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/server/routes.ts#L7816) -> Firebase/cloud helper layer in [server/cloudSync.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/server/cloudSync.ts) -> external cloud services -> response -> settings toasts

### Video/media upload
UI -> [client/src/components/video/VideoFeed.tsx](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/components/video/VideoFeed.tsx#L1342) snapshot/record handlers -> `/api/drive/upload` -> Drive helper in [server/googleDrive.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/server/googleDrive.ts) -> external storage -> `/api/media` metadata create -> [server/storage.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/server/storage.ts) persistence -> UI toast

### Servo/payload control
UI -> payload/gripper controls in [client/src/components/controls/ControlDeck.tsx](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/components/controls/ControlDeck.tsx) or terminal cards -> command dispatch or `/api/servo/control` route -> backend bridge/script -> device -> response -> UI toast/state update

### Automation execution
UI -> [client/src/components/panels/AutomationPanel.tsx](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/components/panels/AutomationPanel.tsx) -> `GET/POST/PATCH/DELETE /api/automation/scripts` (recipes) and `/api/automation/scripts/execute` (run) -> `AutomationService` + DB -> `resolveAutomationCommand` -> command dispatch -> ack/fail -> backend updates `lastRun`

### Terminal commands
UI -> [client/src/components/panels/TerminalCommandsPanel.tsx](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/components/panels/TerminalCommandsPanel.tsx) -> command dispatch -> `/api/commands/dispatch` -> safe unified-command resolver -> limited command set only -> ack/fail -> UI result

### Calibration flows
UI -> [client/src/components/panels/CalibrationPanel.tsx](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/components/panels/CalibrationPanel.tsx) -> `/api/mavlink/calibration/start|cancel|status` -> calibration bridge script -> in-memory `calibrationState` update -> response -> panel refresh

### Firmware flashing
UI -> [client/src/components/panels/SettingsPanel.tsx](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/components/panels/SettingsPanel.tsx#L1680) -> `/api/firmware/flash` -> firmware bridge/process -> in-memory `firmwareState` -> client polling `/api/firmware/status` -> UI progress

### Plugin tool execution
UI -> [client/src/components/panels/PluginToolchainPanel.tsx](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/components/panels/PluginToolchainPanel.tsx) -> `/api/plugins/:id/run-tool` -> [server/pluginToolRunner.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/server/pluginToolRunner.ts) build safe spawn spec -> child process -> stdout/stderr -> UI output panel

### 3D mapping reconstruction
UI -> [client/src/components/video/VideoFeed.tsx](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/components/video/VideoFeed.tsx#L759) frame upload + [client/src/pages/home.tsx](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/pages/home.tsx#L248) reconstruct/reset -> `/api/mapping/3d/*` -> in-memory `mappingState` + generated model file -> `/api/mapping/3d/model/latest` -> UI status display

## Final Required Outputs

### 1. Prioritized bug list

1. Route-local runtime state for missions, firmware, RTK, calibration, audio, and mapping
2. File-backed JSON storage for core operational entities
3. ~~Automation recipes are still local-only and not backend-shared~~ **RESOLVED** — recipes persisted in DB via `/api/automation/scripts`
4. Offline backlog is still not receipt-driven and server-authoritative
5. Cloud command/telemetry/admin endpoints appear unused by client
6. Browser-local message backup duplicates server truth
7. Camera settings are centralized in the main UI now, but still not drone-scoped
8. Selected drone is not server-scoped
9. Telemetry state still depends on DOM events and browser globals
10. Camera/media and tracking flows still over-rely on browser-local execution paths
11. `useOfflineSync` and `useTelemetryWithBacklog` are dead code — never imported; client never triggers `/api/backlog/sync`

### 2. Missing implementations list

- ~~Real backend-owned automation script model and executor~~ Implemented — AutomationService, automation_recipes table, CRUD API.
- Server-backed selected-drone/operator preference state
- Durable mission run and job store
- Per-drone backend-owned camera settings model
- Client use of cloud command/telemetry/admin endpoints
- Durable applied-state records for mission/fence/airframe/profile changes

### 3. Duplicate/redundancy list

- Browser `localStorage` message cache versus server messages
- Browser unsent backlog staging versus server backlog authority
- Telemetry via websocket + DOM events + browser globals
- Case-variant audit report naming

### 4. Performance optimization list

- Replace file-backed JSON storage with database persistence
- Remove overlapping polling where websocket state already exists
- Centralize telemetry state and remove repeated window event listeners
- Stop persisting operational state in `localStorage`
- Add server-side pagination/filters for history-heavy lists

### 5. Security remediation list

- Require auth on all `/api` routes except explicit public health endpoints
- Require permission middleware on all write/device/cloud/admin routes
- Protect `/api/chat-users` and similar enumeration endpoints
- Move auth and operational records out of flat JSON files
- Split monolithic routes into domain routers with default middleware

### 6. Multi-user/data-sync risk list

- Selected drone is browser-scoped
- Active mission and firmware job state is process-scoped
- Message state is duplicated in the browser
- Offline backlog still relies on browser staging before server receipt
- Audio state is in-memory and non-durable
- Camera settings are not yet scoped by drone/session

### 7. Features that are present in UI but not truly functional

- Some cloud fleet/admin awareness features
- Browser tracking flow as a true drone tracking/autonomy subsystem

### 8. Backend endpoints that exist but appear unused

No client reference found for these routes:

- `GET /api/commands/lease` — Lease status not displayed in ControlDeck; 409 on dispatch surfaces error but no proactive UI.
- `/api/cloud/commands/dispatch`
- `/api/cloud/commands/:id/ack`
- `/api/cloud/commands`
- `/api/cloud/telemetry/ingest`
- `/api/cloud/telemetry/live`
- `/api/cloud/awareness`
- `/api/cloud/admin-dashboard`
- `/api/messages/sync`
- `/api/google/configured`
- `/api/automation/runs`
- `/api/commands/:id`
- `/api/servo/status`
- `/api/integrations/verify`

**Note**: `GET /api/operator/preferences` and `PATCH /api/operator/preferences` are used by client via [client/src/lib/api.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/lib/api.ts).

### 9. File deletion list (safe to remove after verification)

| File | Reason |
|------|--------|
| `client/src/hooks/useOfflineSync.ts` | `useOfflineSync` and `useTelemetryWithBacklog` never imported. Backend `/api/backlog/*` would become orphaned; either remove hook and document, or wire it into app. |
| `attached_assets/Logo/Background removed logo.png` | Duplicate logo; not referenced. |
| `attached_assets/Logo/logo with white BG.png` | Duplicate logo; not referenced. |

**Do not delete** without verifying: `client/public/opengraph.jpg` — may not exist (only `opengraph.png` found). UI components (accordion, alert-dialog, etc.) — check for transitive imports before removal.

### 10. Final readiness score out of 100

**62/100**

Primary blockers: weak runtime-state durability, file-backed persistence, and several uncentralized multi-user state paths. (Automation recipes now backend-owned.)

---

## N. Deep Audit Supplement (2026-03-14)

Exhaustive pass performed per full audit requirements. Findings below extend and refine prior sections.

### N1. Dead Code / Orphaned Files

| File | Status | Evidence |
|------|--------|----------|
| `client/src/hooks/useOfflineSync.ts` — `useTelemetryWithBacklog` | **UNUSED** | No import found anywhere in codebase. `useOfflineSync` also never imported. Entire offline sync client hook is dead. |
| `client/src/hooks/useOfflineSync.ts` — `useOfflineSync` | **UNUSED** | Exported but never imported by any component. `POST /api/backlog/sync` is only called from this hook, so backlog sync client path is effectively dead. |
| `client/public/opengraph.jpg` | **DUPLICATE** | `opengraph.png` exists; jpg may be legacy. Check index.html/manifest references. |
| `attached_assets/Logo/Background removed logo.png` | **POTENTIALLY UNUSED** | Logo variant; verify build/html references. |
| `attached_assets/Logo/logo with white BG.png` | **POTENTIALLY UNUSED** | Logo variant; verify references. |

### N2. Backend Endpoints — Unused by Client (Extended)

No client `fetch` or `apiFetch` reference found for:

- `/api/cloud/commands/dispatch`
- `/api/cloud/commands/:id/ack`
- `/api/cloud/commands`
- `/api/cloud/telemetry/ingest`
- `/api/cloud/telemetry/live`
- `/api/cloud/awareness`
- `/api/cloud/admin-dashboard`
- `/api/cloud/media/upload` (SettingsPanel has `/api/drive/upload`; cloud/media may differ)
- `/api/cloud/media/sync-pending`
- `/api/messages/sync`
- `/api/google/configured`
- `/api/automation/runs`
- `/api/commands/:id` (detail by ID)
- `/api/commands/lease` (lease status — exists, enforced on dispatch, but client does not fetch for UI)
- `/api/servo/status`
- `/api/integrations/verify`

### N3. Python Scripts — All Referenced

All 13 scripts in `scripts/` are invoked by `server/routes.ts` or `server/index.ts`:

- `mavlink_params.py`, `mavlink_vehicle_control.py`, `mavlink_mission.py`, `mavlink_fence.py`, `mavlink_rally.py`, `mavlink_calibration.py`, `mavlink_inspector.py`, `mavlink_firmware.py`, `mavlink_dataflash.py`, `mavlink_geotag.py`, `servo_control.py`, `bme688_monitor.py`, `runtime_bootstrap.py`

`setup-gpio-access.sh` is self-referential (usage instructions). `build-standalone.ps1` and `build-standalone.sh` are build helpers, not runtime.

### N4. Recently Implemented (Post-Prior-Audit)

- **Per-drone command lease**: Implemented in `server/routes.ts`. `acquireCommandLease`, `getCommandLease`, lease check on dispatch, `GET /api/commands/lease`. Client does not yet surface lease status in UI; 409 on conflict is passed through via `data?.error` in `commandService.ts`.
- **BME688 production gating**: Non-Pi production returns 503 unavailable.
- **Connection test gating**: Simulated + production returns `success: false`.
- **Telemetry SIM badge**: Shown when `rawTelemetry?.source === "sim"`.
- **arm-state-changed dispatch**: TelemetryContext dispatches when `armed` in telemetry changes.

### N5. UI Components — Import Audit

Radix/deps components in `client/src/components/ui/`: accordion, alert-dialog, aspect-ratio, avatar, button-group, calendar, carousel, context-menu, drawer, dropdown-menu, hover-card, input-group, input-otp, menubar, navigation-menu, pagination, toggle-group — present in FILE_LIST. Many may be used only transitively (e.g., via shadcn wrappers). Safe deletion requires per-component grep; recommend keeping unless explicitly unused.

### N6. Operator Preference Service

`operatorPreferenceService` is used in `server/routes.ts` for `/api/operator/preferences` (GET/PATCH). Client integration for selected-drone persistence not fully traced; service is backend-backed.

### N7. File Deletion Recommendations (Conservative)

**Safe to remove** (after verification):

- `attached_assets/Logo/Background removed logo.png` — if no refs in build
- `attached_assets/Logo/logo with white BG.png` — if no refs in build
- `client/public/opengraph.jpg` — if only `opengraph.png` is referenced

**Refactor/disable**:

- `client/src/hooks/useOfflineSync.ts` — Either wire into a mounted component and document staging semantics, or remove and delete `/api/backlog/*` client usage. Currently orphaned.

### N8. Final Readiness Score Update

Remains **62/100**. Dead offline sync client does not improve score; command lease improves operational safety but is incomplete without client lease-status UI.

---

## N. Deep Audit Supplement (2026-03-14)

Exhaustive audit pass covering file usage, dead code, Python scripts, cloud endpoints, and UI wiring.

### N1. Dead Code / Unused Client Modules

| File | Status | Evidence |
|------|--------|----------|
| [client/src/hooks/useOfflineSync.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/hooks/useOfflineSync.ts) | **UNUSED** | `useOfflineSync` and `useTelemetryWithBacklog` are never imported by any component. No client references. |
| [client/src/hooks/useOfflineSync.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/hooks/useOfflineSync.ts) → `useTelemetryWithBacklog` | **DEAD** | Exported but never imported. |

**Impact**: The entire offline sync client path is dead. `POST /api/backlog/sync` is only invoked from `useOfflineSync.queueData` → `syncBacklogRef.current()`, which is never mounted. The backend offline sync endpoints exist but have no active client consumer.

**Recommendation**: Either wire `useOfflineSync` into a mounted component (e.g. TopBar, TelemetryPanel, or App) or remove the hook and document that offline sync is backend-only / future work.

### N2. Backend Endpoints With No Client Usage (Expanded)

Verified via codebase grep. No `fetch`, `apiFetch`, or React Query usage found for:

| Endpoint | Purpose |
|----------|---------|
| `POST /api/cloud/commands/dispatch` | Cloud command dispatch |
| `POST /api/cloud/commands/:id/ack` | Cloud command ack |
| `GET /api/cloud/commands` | Cloud command list |
| `POST /api/cloud/telemetry/ingest` | Cloud telemetry ingest |
| `GET /api/cloud/telemetry/live` | Cloud telemetry live |
| `GET /api/cloud/awareness` | Fleet awareness |
| `GET /api/cloud/admin-dashboard` | Admin dashboard |
| `GET /api/integrations/verify` | Integration verification |
| `GET /api/automation/runs` | Automation run history |
| `GET /api/commands/:id` | Single command detail |
| `GET /api/commands/lease` | Command lease status (lease enforced on dispatch; UI does not poll or display) |
| `GET /api/servo/status` | Servo status |
| `GET /api/google/configured` | Google configured check |
| `POST /api/messages/sync` | Message sync |

**Note**: `GET /api/commands/lease` is registered before `/api/commands/:id`; the lease is enforced on `POST /api/commands/dispatch` (409 when another user holds it). The client does not call the lease endpoint to display "controlled by X" in the UI.

### N3. Python Scripts – Full Inventory

All scripts in `scripts/` are referenced by the server:

| Script | Referenced By | Purpose |
|--------|---------------|---------|
| `mavlink_params.py` | server/routes.ts | FC parameters |
| `mavlink_vehicle_control.py` | server/routes.ts | Vehicle actions |
| `mavlink_mission.py` | server/routes.ts | Mission upload/download/validate |
| `mavlink_fence.py` | server/routes.ts | Geofence upload/download |
| `mavlink_rally.py` | server/routes.ts | Rally points |
| `mavlink_calibration.py` | server/routes.ts | Calibration |
| `mavlink_inspector.py` | server/routes.ts | MAVLink inspector |
| `mavlink_firmware.py` | server/routes.ts | Firmware flash/recovery |
| `mavlink_dataflash.py` | server/routes.ts | DataFlash list/download/analyze/replay |
| `mavlink_geotag.py` | server/routes.ts | Geotag run |
| `servo_control.py` | server/routes.ts | Gripper/servo control |
| `bme688_monitor.py` | server/routes.ts | BME688 environmental sensor |
| `runtime_bootstrap.py` | server/index.ts | Runtime bootstrap |

| Script | Status |
|--------|--------|
| `setup-gpio-access.sh` | Self-referenced; may be run manually on Pi |
| `build-standalone.sh` | Build automation |
| `build-standalone.ps1` | Windows build automation |

No orphan Python scripts found. All are backend-wired.

### N4. Client API Usage – Verified Paths

The following API groups are actively used by the client (confirmed via `fetch`/`apiFetch`):

- `/api/auth/*` – UserAccessPanel, TopBar
- `/api/admin/*` – UserAccessPanel
- `/api/drones` – React Query, DroneSelectionPanel
- `/api/messages` – TopBar
- `/api/chat-users` – TopBar
- `/api/commands/dispatch` – ControlDeck, TerminalCommandsPanel, AutomationPanel, MavlinkToolsPanel, GpsDeniedNavPanel, MLNavigationEngine, EmergencyProtocolController
- `/api/mavlink/*` – MissionPlanningPanel, GeofencingPanel, CalibrationPanel, MavlinkToolsPanel, FlightControllerParamsPanel, RtkNtripPanel, VehicleSetupPanel, FlightLogsPanel
- `/api/camera-settings` – VideoFeed
- `/api/drive/upload`, `/api/media` – VideoFeed
- `/api/cloud/config`, `/api/cloud/status`, `/api/cloud/test`, `/api/cloud/sync-all` – SettingsPanel
- `/api/bme688/*` – useBME688, BME688Panel
- `/api/mapping/3d/*` – home.tsx, VideoFeed
- `/api/plugins/*` – PluginToolchainPanel
- `/api/automation/scripts/execute` – AutomationPanel
- `/api/firmware/*` – SettingsPanel
- `/api/connections/test` – SettingsPanel
- `/api/backlog/sync` – useOfflineSync (dead, never mounted)
- `/api/operator/preferences` – operatorPreferenceService (server-side); need to verify client calls

### N5. OperatorPreferenceService Wiring

- **Server**: `operatorPreferenceService` is used in `server/routes.ts` for `/api/operator/preferences` (GET and PATCH around lines 7350, 7362).
- **Client**: No `fetch('/api/operator/preferences')` found in client code. Operator preferences (e.g. selected drone) are not persisted or read from this service by the frontend.

### N6. File Deletion Candidates (Safe to Remove)

With high confidence:

| File | Reason |
|------|--------|
| `attached_assets/Logo/Background removed logo.png` | Duplicate/alternate logo; not referenced in code |
| `attached_assets/Logo/logo with white BG.png` | Duplicate/alternate logo; not referenced in code |

**Conditional**: `client/src/hooks/useOfflineSync.ts` – Remove only if offline sync is abandoned. If kept, it must be wired into a mounted component.

### N7. UI Components – Usage Status

Radix-based components in `client/src/components/ui/` are imported where needed. The following are typically used indirectly or in specific screens:

- `accordion`, `alert-dialog`, `aspect-ratio`, `avatar`, `button-group`, `calendar`, `carousel`, `context-menu`, `drawer`, `dropdown-menu`, `hover-card`, `input-group`, `input-otp`, `menubar`, `navigation-menu`, `pagination`, `toggle-group`

Recommend verifying each via import graph before deletion. Many may be used by other UI primitives or less-often-rendered views.

### N8. Per-Drone Command Lease (Recent Addition)

- **Implemented**: `getCommandLease`, `acquireCommandLease` in server/routes.ts. Lease checked before dispatch; 409 returned when another user holds the lease. Lease acquired on successful ack. TTL: 2 minutes.
- **Endpoint**: `GET /api/commands/lease?connectionString=...` – exists but not used by client.
- **Recommendation**: Add lease-status polling or display in ControlDeck/DroneSelectionPanel so operators see "Drone controlled by {user}" when another user has the lease.

---

## N. DEEP AUDIT SUPPLEMENT (2026-03-14)

Additional findings from exhaustive file-level, wiring, and flow verification.

### N1. Dead / Unused Code

| File / Export | Status | Evidence |
|---------------|--------|----------|
| `client/src/hooks/useOfflineSync.ts` – `useOfflineSync` | **UNUSED** | No import found in any client component. Hook never mounted. |
| `client/src/hooks/useOfflineSync.ts` – `useTelemetryWithBacklog` | **UNUSED** | No import found. Effectively dead. |
| `/api/backlog/sync` client path | **UNUSED** | Only called from `useOfflineSync.queueData` / sync; since hook is never used, this client path is dead. |

**Recommendation**: Either wire `useOfflineSync` into a main app component (e.g. TopBar, home layout) or remove the hook and document that offline backlog is backend-only until a proper client is implemented.

### N2. Unused Backend Endpoints (Client Never Calls)

No client `fetch` or `apiFetch` reference found for:

- `POST /api/cloud/commands/dispatch`
- `POST /api/cloud/commands/:id/ack`
- `GET /api/cloud/commands`
- `POST /api/cloud/telemetry/ingest`
- `GET /api/cloud/telemetry/live`
- `GET /api/cloud/awareness`
- `GET /api/cloud/admin-dashboard`
- `GET /api/messages/sync`
- `GET /api/google/configured`
- `GET /api/automation/runs`
- `GET /api/commands/:id` (individual command detail)
- `GET /api/commands/lease` (lease status – backend enforced; UI does not yet poll/display)
- `GET /api/servo/status`
- `GET /api/integrations/verify`

### N3. Python Scripts – All Referenced

All 13 scripts in `scripts/` are invoked by `server/routes.ts` or `server/index.ts`:

- `mavlink_params.py`, `mavlink_vehicle_control.py`, `mavlink_mission.py`, `mavlink_fence.py`, `mavlink_rally.py`, `mavlink_calibration.py`, `mavlink_inspector.py`, `mavlink_firmware.py`, `mavlink_dataflash.py`, `mavlink_geotag.py`, `servo_control.py`, `bme688_monitor.py`, `runtime_bootstrap.py`

`scripts/setup-gpio-access.sh` is self-referential (help text). `scripts/build-standalone.ps1` and `scripts/build-standalone.sh` are build helpers.

### N4. Operator Preference Service – Used

`operatorPreferenceService` is used in `server/routes.ts` for `/api/operator/preferences` (get/update). Preferences are in-memory; not durable across restart.

### N5. Command Lease (Recently Added)

- **Backend**: Per-drone command lease enforced in `POST /api/commands/dispatch`. Returns 409 when another user holds the lease.
- **Lease**: `GET /api/commands/lease?connectionString=...` exists for status.
- **Client**: Does not yet poll or display lease status; lease conflict is surfaced via 409 error in dispatch.

### N6. File Deletion Candidates (Safe to Remove After Verification)

| Path | Reason |
|------|--------|
| `attached_assets/Logo/Background removed logo.png` | Duplicate/alternate logo asset |
| `attached_assets/Logo/logo with white BG.png` | Duplicate/alternate logo asset |

*Note*: Retain `client/public/` assets (favicon, icons, opengraph) as they may be referenced by HTML manifest or meta tags.

### N7. UI Components – Import Verification

Radix-based components (accordion, alert-dialog, avatar, carousel, context-menu, drawer, dropdown-menu, hover-card, input-group, input-otp, menubar, navigation-menu, pagination, toggle-group, aspect-ratio, button-group, calendar) exist. A subset is used by other components; some may be unused. Recommend `grep -r "from.*@/components/ui/<name>" client/src` before deletion.

### N8. Cloud / Sync Audit Summary

| Component | Status | Issue |
|-----------|--------|-------|
| Firebase / cloud config | Used | SettingsPanel uses config, status, test, sync-all |
| Cloud commands/telemetry/awareness | Unused | Endpoints exist; no client calls |
| Offline backlog server | Partial | `/api/backlog/sync` used only by dead `useOfflineSync` |
| Google Drive/Sheets | Used | SettingsPanel, VideoFeed use drive/upload, backup |
| Operator preferences | Used | In-memory; not durable |

### N9. Reliability – Command Acknowledgement vs Outcome

- Commands return when backend script/MAVLink path completes or times out.
- UI often treats “acked” as success; actual hardware state (armed, mode, etc.) comes from telemetry.
- If telemetry omits `armed`, ControlDeck may show incorrect arm state.
- Recommendation: Explicitly distinguish “command accepted” vs “state confirmed” in UI and logs.

### N10. Security – `/api/chat-users` Unauthenticated

`/api/chat-users` is used by TopBar for mention autocomplete. If it returns user lists without auth, it can leak presence/identity. Verify middleware and restrict to authenticated sessions with visibility rules.

---

## DEEP AUDIT SUPPLEMENT (2026-03-14)

### N1. Dead Code & Unused Client Hooks

| File | Status | Details |
|------|--------|---------|
| `client/src/hooks/useOfflineSync.ts` | **UNUSED** | `useOfflineSync` and `useTelemetryWithBacklog` are **never imported** by any component. The entire offline sync client path is dead code. Server `/api/backlog/sync`, `/api/backlog/clear`, `/api/health` (from this hook) are effectively unreachable from the main app. |
| `client/src/hooks/useTelemetryWithBacklog` | **UNUSED** | Exported but never imported. Depends on `useOfflineSync`. |

**Recommendation**: Either wire `useOfflineSync` into the main app (e.g., TelemetryPanel, TopBar) or remove it and the unused backlog client logic to reduce confusion.

### N2. Unused Backend Endpoints (Verified via Client Grep)

No `fetch` or API call found in client for:

| Endpoint | Purpose |
|---------|---------|
| `GET /api/commands/lease` | Command lease status — backend enforces lease on dispatch, but UI never displays "controlled by X" or checks before sending |
| `GET /api/commands/:id` | Single command detail — client uses list only |
| `GET /api/automation/runs` | Automation run history — no panel surfaces this |
| `GET /api/servo/status` | Servo/gripper status — no client call |
| `GET /api/cloud/commands` | Cloud command queue |
| `POST /api/cloud/commands/dispatch` | Cloud command dispatch |
| `POST /api/cloud/commands/:id/ack` | Cloud command ack |
| `POST /api/cloud/telemetry/ingest` | Cloud telemetry ingest |
| `GET /api/cloud/telemetry/live` | Cloud telemetry live |
| `GET /api/cloud/awareness` | Cloud fleet awareness |
| `GET /api/cloud/admin-dashboard` | Cloud admin dashboard |
| `GET /api/integrations/verify` | Integration verification |
| `GET /api/google/configured` | Google OAuth configured state |
| `POST /api/messages/sync` | Message sync |

### N3. Python Script Usage (All Scripts Referenced)

| Script | Referenced by |
|--------|---------------|
| `mavlink_params.py` | routes.ts (params, fence params) |
| `mavlink_vehicle_control.py` | routes.ts (vehicle action, manual control) |
| `mavlink_mission.py` | routes.ts (upload, download, validate, diff) |
| `mavlink_fence.py` | routes.ts (fence upload/download) |
| `mavlink_rally.py` | routes.ts (rally upload/download) |
| `mavlink_calibration.py` | routes.ts (calibration start/cancel) |
| `mavlink_inspector.py` | routes.ts (inspector snapshot/live) |
| `mavlink_firmware.py` | routes.ts (flash, recover) |
| `mavlink_dataflash.py` | routes.ts (list, download, analyze, replay) |
| `mavlink_geotag.py` | routes.ts (geotag run) |
| `servo_control.py` | routes.ts (gripper, servo control) |
| `bme688_monitor.py` | routes.ts (BME688 read/status/debug) |
| `runtime_bootstrap.py` | server/index.ts (startup) |
| `setup-gpio-access.sh` | Self-reference only; not called by Node |
| `build-standalone.sh` | May be used by deployment scripts |
| `build-standalone.ps1` | Windows build script |

### N4. Recently Implemented Fixes (Post-Remediation)

- **Per-drone command lease**: Backend enforces lease on `/api/commands/dispatch` (409 if another user holds it). `acquireCommandLease` on success. `GET /api/commands/lease` exists but client does not call it to surface "controlled by X" in UI.
- **BME688 production gating**: When `NODE_ENV=production` and not on Pi, returns 503 instead of simulated data.
- **Connection test production gating**: When simulated and production, returns `success: false`.
- **Telemetry sim badge**: TelemetryPanel shows "SIM" when `source === 'sim'`.
- **Arm-state flow**: TelemetryContext dispatches `arm-state-changed` when telemetry has `armed`; TelemetryPanel no longer initializes `isArmed` from localStorage.
- **Automation relabel**: "Rule-based command mapping" added to AutomationPanel.
- **Offline sync disclaimer**: JSDoc added to useOfflineSync (but hook remains unused).

### N5. Files Safe to Delete (Low Risk)

| Path | Reason |
|------|--------|
| `attached_assets/Logo/Background removed logo.png` | Duplicate/alternate logo asset |
| `attached_assets/Logo/logo with white BG.png` | Duplicate/alternate logo asset |

**Not recommended** without further verification: UI components (accordion, carousel, etc.) — many may be imported transitively or by routing; deleting could break build.

### N6. Operator Preference Service

`OperatorPreferenceService` is used in [server/routes.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/server/routes.ts) around lines 7350–7362 for `/api/operator/preferences` (GET/PATCH). Client usage should be verified for settings persistence.

### N7. Command Lease UI Gap

Backend command lease is enforced (409 on conflict), but:
- Client does not call `GET /api/commands/lease` to show "Drone controlled by {user}" before or during control attempts.
- User only sees conflict after attempting a command. Recommendation: Add lease status fetch in ControlDeck when a drone is selected and display a warning badge when another user holds the lease.
