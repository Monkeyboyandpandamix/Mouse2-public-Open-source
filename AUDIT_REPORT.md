# M.O.U.S.E. Deep Audit Report

Date: 2026-03-18

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
4. Automation recipes are still stored in the browser and are not backend-owned or multi-user visible.
5. Message state still keeps browser-local backup/cache behavior in [client/src/components/layout/TopBar.tsx](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/components/layout/TopBar.tsx).
6. Offline sync still relies on browser staging in [client/src/hooks/useOfflineSync.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/hooks/useOfflineSync.ts) instead of a receipt-driven server-first queue.
7. Camera settings in [client/src/components/video/VideoFeed.tsx](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/components/video/VideoFeed.tsx) are backend-backed now, but not yet scoped by drone or session.
8. Selected-drone context is still browser-scoped rather than server-scoped for multi-user coordination.
9. Telemetry client authority is still split across websocket events, DOM events, and window globals instead of one typed store.
10. Audio state is still backed by transient route state and partial polling rather than a durable session/service model.
11. Mission/fence/applied-profile truth is not durably recorded per drone, so later operators cannot reliably inspect last-applied FC state.
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

### 6. Terminal panel now exposes only backend-supported commands
- Feature group: Automation, terminal, and debugging
- Severity: Low
- Files: [client/src/components/panels/TerminalCommandsPanel.tsx](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/components/panels/TerminalCommandsPanel.tsx)
- Related components/functions/routes: `isBackendSupportedTerminalCommand`
- Root cause: N/A, misleading commands were filtered from the panel
- Why it matters: the UI no longer advertises unsupported shell/Python actions as executable features
- Exact fix recommendation: source the supported command catalog from the backend in a future pass
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

### 2. Automation recipes remain browser-local and not backend-shared
- Feature group: Automation, terminal, and debugging
- Severity: High
- Files: [client/src/components/panels/AutomationPanel.tsx](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/components/panels/AutomationPanel.tsx), [server/routes.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/server/routes.ts#L4092)
- Related components/functions/routes: `/api/automation/scripts/execute`, `resolveAutomationCommand`
- Root cause: the UI was corrected to present local rule-based recipes, but the recipes are still stored only in the browser and the backend still executes a narrow mapped action set.
- Why it matters: automation is safer and less misleading now, but it is not yet centralized or multi-user auditable.
- Exact fix recommendation: persist automation recipes on the backend and expose the supported action catalog from the server.
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

### 4. Messaging is implemented, but still mixed with browser-local backup state
- Feature group: Audio and communications
- Severity: Medium
- Files: [client/src/components/layout/TopBar.tsx](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/components/layout/TopBar.tsx#L84), [server/routes.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/server/routes.ts#L7413), [server/storage.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/server/storage.ts)
- Related components/functions/routes: `/api/messages`, `/api/messages/:id`, websocket `new_message`, `message_updated`, `message_deleted`
- Root cause: live message CRUD exists, but the top bar still caches `mouse_gcs_messages` in the browser and merges runtime state around it.
- Why it matters: browser-local message state can drift from server truth and complicates multi-user consistency.
- Exact fix recommendation: remove local message authority, keep only a transient cache if needed, and always reconcile from the server stream.
- Confidence level: High

### 5. Offline sync exists, but queue ownership is split
- Feature group: Offline-first, backup, and cloud sync
- Severity: Medium
- Files: [client/src/hooks/useOfflineSync.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/hooks/useOfflineSync.ts), [server/routes.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/server/routes.ts#L7265), [server/storage.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/server/storage.ts)
- Related components/functions/routes: `/api/backlog`, `/api/backlog/sync`, `mouse_offline_backlog`
- Root cause: the browser now stages unsent backlog locally and triggers sync correctly, but the authoritative backlog still is not fully server-first and receipt-based.
- Why it matters: restart and retry semantics are cleaner than before, but reconciliation is still more complex than a single receipt-driven queue.
- Exact fix recommendation: make the server backlog authoritative with receipt ids; keep only unsent client-stage items locally.
- Confidence level: High

### 6. Camera settings are backend-backed in the main video UI, but not yet drone-scoped
- Feature group: Camera, media, and payload
- Severity: Medium
- Files: [server/routes.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/server/routes.ts#L6438), [client/src/components/video/VideoFeed.tsx](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/components/video/VideoFeed.tsx#L122)
- Related components/functions/routes: `/api/camera-settings`, `VideoFeed`
- Root cause: the main camera UI now hydrates and saves through the backend route, but settings are still global rather than clearly keyed by selected drone/session.
- Why it matters: this is centralized compared with the earlier browser-local path, but it is not yet a complete per-drone source of truth.
- Exact fix recommendation: scope camera settings by drone id/session and publish changes over the same realtime path as other operational state.
- Confidence level: High

### 6. Video/media capture works for browser capture, but is not a proved drone-camera pipeline
- Feature group: Camera, media, and payload
- Severity: Medium
- Files: [client/src/components/video/VideoFeed.tsx](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/components/video/VideoFeed.tsx#L1127), [client/src/components/video/VideoFeed.tsx](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/components/video/VideoFeed.tsx#L1342), [server/routes.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/server/routes.ts#L7173)
- Related components/functions/routes: gimbal commands, drive upload, media metadata create
- Root cause: snapshot and recording flows are real for the browser and metadata store, but actual drone camera integration is not proved by the repository.
- Why it matters: field operators may assume onboard camera/media pipelines that are not guaranteed.
- Exact fix recommendation: separate browser demo camera features from actual drone camera ingestion and make device source explicit in the UI.
- Confidence level: Medium

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

### 9. Tracking panel is sophisticated browser ML, not a verified drone tracking subsystem
- Feature group: Object recognition and tracking
- Severity: Medium
- Files: [client/src/components/panels/TrackingPanel.tsx](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/components/panels/TrackingPanel.tsx)
- Related components/functions/routes: TensorFlow COCO-SSD, webcam, local plate records
- Root cause: tracking is performed locally in-browser with TensorFlow and webcam input; there is no proved backend/device bridge for onboard target tracking control.
- Why it matters: good demo and operator aid, but not a proven flight-control tracking system.
- Exact fix recommendation: clearly mark browser-local detection mode versus real onboard tracking mode, and persist only audited tracking actions.
- Confidence level: High

### 10. 3D mapping flow exists, but only as a lightweight local reconstruction model
- Feature group: 3D mapping / reconstruction
- Severity: Medium
- Files: [client/src/pages/home.tsx](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/pages/home.tsx#L237), [client/src/components/video/VideoFeed.tsx](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/components/video/VideoFeed.tsx#L759), [server/routes.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/server/routes.ts#L2258)
- Related components/functions/routes: `/api/mapping/3d/status`, `/api/mapping/3d/frame`, `/api/mapping/3d/reconstruct`, `/api/mapping/3d/model/latest`
- Root cause: mapping frames are ingested and a simple model artifact is generated, but the state is in-memory and the reconstruction path is lightweight rather than a robust mapping subsystem.
- Why it matters: it works as a bounded feature but should not be treated as a production mapping pipeline.
- Exact fix recommendation: persist mapping jobs and artifacts with job ownership, and separate preview-quality from production-quality reconstructions.
- Confidence level: High

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
- Files: [client/src/components/layout/TopBar.tsx](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/components/layout/TopBar.tsx#L84), [client/src/hooks/useOfflineSync.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/hooks/useOfflineSync.ts), [client/src/components/video/VideoFeed.tsx](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/components/video/VideoFeed.tsx#L122), [client/src/components/panels/AutomationPanel.tsx](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/components/panels/AutomationPanel.tsx#L91), [client/src/components/controls/ControlDeck.tsx](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/components/controls/ControlDeck.tsx#L41)
- Related components/functions/routes: `mouse_gcs_messages`, `mouse_offline_backlog`, `mouse_automation_scripts`
- Root cause: several important flows still use `localStorage` as active state rather than only transient UX cache, even though camera settings and armed state were moved off that path.
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

### 3. Message user presence leaks through unauthenticated endpoint
- Feature group: Audio and communications
- Severity: Medium
- Files: [server/routes.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/server/routes.ts#L7431)
- Root cause: `/api/chat-users` is not protected by auth
- Why it matters: user enumeration and privacy risk
- Exact fix recommendation: require auth and filter by visibility rules
- Confidence level: High

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

### 3. `useOfflineSync` still relies on browser staging before a durable server receipt
- Feature group: Reliability
- Severity: Medium
- Files: [client/src/hooks/useOfflineSync.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/hooks/useOfflineSync.ts#L74)
- Root cause: the immediate duplicate POST path was removed, but staging remains client-owned until sync finishes
- Why it matters: better than before, but crash windows and reconciliation logic still exist
- Exact fix recommendation: issue a server receipt id on enqueue and treat local storage as transient unsent staging only
- Confidence level: High

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
- Files: [client/src/components/layout/TopBar.tsx](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/components/layout/TopBar.tsx), [client/src/components/controls/ControlDeck.tsx](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/components/controls/ControlDeck.tsx), [client/src/components/video/VideoFeed.tsx](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/components/video/VideoFeed.tsx), [client/src/hooks/useOfflineSync.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/hooks/useOfflineSync.ts)
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
| Automation/debug | Automation panel | Yes | Yes | Yes | Yes | Local only | No | No | Partial | Partial | UI now presents local recipes, but they are not backend-shared |
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
| Automation | Save script | Persist automation | local state + `localStorage` | none | Partial | Local-only recipes are safer and clearer, but still not backend-backed |
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
UI -> [client/src/components/panels/AutomationPanel.tsx](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/client/src/components/panels/AutomationPanel.tsx) -> `/api/automation/scripts/execute` in [server/routes.ts](/Users/mohammadaghamohammadi/Desktop/Projects/MOUSE2-app/server/routes.ts#L4117) -> keyword mapping via `resolveAutomationCommand` -> command dispatch -> ack/fail -> UI updates local `lastRun`

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
3. Automation recipes are still local-only and not backend-shared
4. Offline backlog is still not receipt-driven and server-authoritative
5. Cloud command/telemetry/admin endpoints appear unused by client
6. Browser-local message backup duplicates server truth
7. Camera settings are centralized in the main UI now, but still not drone-scoped
8. Selected drone is not server-scoped
9. Telemetry state still depends on DOM events and browser globals
10. Camera/media and tracking flows still over-rely on browser-local execution paths

### 2. Missing implementations list

- Real backend-owned automation script model and executor
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

### 9. Final readiness score out of 100

**62/100**

Primary blockers: weak runtime-state durability, file-backed persistence, local-only automation definitions, and several uncentralized multi-user state paths.
