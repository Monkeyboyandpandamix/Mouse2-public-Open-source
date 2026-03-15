# M.O.U.S.E. Drone Platform – Production Readiness Audit Report

**Audit Date:** March 14, 2025  
**Scope:** Full codebase – frontend, backend, API wiring, database, security, performance, reliability

---

## A. Executive Summary

The M.O.U.S.E. drone platform is a complex, feature-rich GCS (Ground Control Station) with multi-drone support, MAVLink integration, geofencing, mission planning, object tracking, audio broadcast, cloud sync, and extensive hardware/peripheral integrations. The audit reveals a **functional but unevenly mature** system:

- **Core flows (missions, waypoints, flight control, geofencing) are wired end-to-end** and backed by Python MAVLink scripts and Express routes.
- **Several UI features are only partially wired** (e.g., Camera Feeds page shows local webcam previews, not actual drone streams; some stabilization panels may not drive real hardware).
- **Duplicate polling, intervals, and silent `.catch(() => {})` patterns** exist across frontend and backend, creating reliability and observability gaps.
- **Geofence and airspace data sources are intentionally dual** (localStorage + FC + external APIs), with a UI banner in place to clarify this.
- **Auth and permission middleware are correctly applied** to protected routes; `/api/health` is intentionally unauthenticated for Electron startup.

**Readiness Score: 62/100** – Usable for controlled deployments; recommended fixes before high-stakes production use.

---

## B. Confirmed Working Features

| Feature | Evidence |
|--------|----------|
| Mission planning (create, waypoints, upload, execute) | `MissionPlanningPanel` → `/api/missions`, `/api/waypoints`, `/api/mavlink/mission/upload`; `runMavlinkVehicleControl` in routes |
| Geofence upload/download | `GeofencingPanel` → `/api/mavlink/fence/upload`, `/api/mavlink/fence/download`; `mavlink_fence.py` |
| Calibration (start/cancel) | `CalibrationPanel` → `/api/mavlink/calibration/*`; Python scripts |
| Flight session start/end | `ControlDeck` → `/api/flight-sessions/start`, `/api/flight-sessions/end`; storage + cloud sync |
| Command dispatch (arm, disarm, RTL, etc.) | `dispatchBackendCommand` → `/api/commands/dispatch`; `executeUnifiedCommand` in routes |
| User auth and permissions | `requireAuth`, `requirePermission`, `serverRolePermissions`; session token via `X-Session-Token` |
| Cloud sync (missions, waypoints, drones, etc.) | `syncCloudDocument`, `appendCloudDocument`, etc. with `logCloudErr` on `.catch` |
| No-fly zone routing | `planRouteAvoidingNoFlyZones`, `segmentIntersectsNoFlyZones` in `noFlyZones.ts`; MissionPlanningPanel uses bbox fetch |
| Object tracking (client-side) | `TrackingPanel` uses TensorFlow.js COCO-SSD + motion fallback on webcam; no backend |
| Speaker/TTS/buzzer | `SpeakerPanel` → `/api/audio/*`; server uses platform-specific commands (say, espeak, PowerShell) |
| RTK/NTRIP | `RtkNtripPanel` → `/api/mavlink/rtk/*`; Python scripts |
| Firmware flash | SettingsPanel → `/api/firmware/flash`; routes spawn flash process |
| Offline backlog sync | `useOfflineSync` → `/api/backlog/sync`; idempotency store |
| Drone selection | `DroneSelectionPanel` → `/api/drones`; persisted to localStorage |

---

## C. Broken Features

| Issue | Severity | File(s) | Root cause | Fix |
|-------|----------|---------|------------|-----|
| **Camera Feeds page: drone streams not connected** | High | `home.tsx` (feeds tab), `VideoFeed.tsx` | "Camera Feeds" tab shows `CameraFeedView` (local webcam only). `VideoFeed` is on Map tab, not Feeds tab. RTSP/stream requires separate config; no end-to-end bridge. | Connect Feeds tab to same VideoFeed or a dedicated stream bridge; document RTSP/HLS/WebRTC requirements. |
| **FlightPathOptimizerPanel mission sync** | Medium | `FlightPathOptimizerPanel.tsx` | Uses `/api/missions` and updates via POST; may not always refresh MissionPlanningPanel state. Two panels can edit same mission without shared invalidation. | **FIXED** – Optimizer dispatches `mission-updated` event and invalidates React Query; MissionPlanningPanel listens. |
| **Storage sync runs even when Google not configured** | Low | `storage.ts` | `syncToGoogle()` returns early if `!sheetsClient && !driveClient`, but `syncPending` can stay true and interval runs every 5 min. | **FIXED** – Early gate when Replit env vars missing; clears syncPending before any async work. |

---

## D. Partially Implemented Features

| Feature | Status | Gap |
|---------|--------|-----|
| **Video feed** | Partial | Map tab has `VideoFeed` (webcam, demo placeholder, static images). Real drone RTSP requires external transcoder (VLC/GStreamer). No WebRTC bridge in codebase. |
| **3D mapping / photogrammetry** | Partial | `/api/mapping/3d/*` exists; `handleReconstruct3D` calls `/api/mapping/3d/reconstruct`. Backend likely uses external tools; full pipeline not verified from code. |
| **Object detection** | UI-only | `TrackingPanel` and `VideoFeed` run COCO-SSD in browser. No backend inference; no gimbal/autopilot integration for actual target locking. |
| **Stabilization panels** | Partial | `AutoStabilizationController`, `MLStabilizationEngine`, `StabilizationActuatorBridge` poll `/api/stabilization/actuate` and similar. Backend routes exist; hardware actuators may not be connected. |
| **GPS-denied navigation** | Partial | `GpsDeniedNavPanel`, `GpsDeniedNavigationController`, `MLNavigationEngine` exist. Commands dispatched; actual ML/odometry pipeline not verified. |
| **BME688 environmental sensor** | Partial | Panel + `/api/bme688/*`; requires hardware. Graceful when unavailable. |
| **Swarm operations** | Partial | `SwarmOpsPanel` → `/api/mavlink/swarm/*`; backend spawns Python. Multi-vehicle coordination logic not fully traceable. |

---

## E. Missing Implementations

| Item | Severity | Notes |
|------|----------|-------|
| ~~Central typed API client~~ | Medium | **DONE** – `client/src/lib/api.ts` has missionsApi, waypointsApi, dronesApi, flightSessionsApi; MissionPlanningPanel, DroneSelectionPanel, FlightLogsPanel use it. |
| **OpenAPI/contract spec** | Low | No OpenAPI file; contracts inferred from Zod schemas and routes. |
| **Persistent session store** | High | `activeSessions` is in-memory. Server restart loses sessions; multi-instance deployment not supported. |
| ~~MissionPlanningPanel ↔ FlightPathOptimizerPanel invalidation~~ | Medium | **FIXED** – Optimizer dispatches mission-updated; MissionPlanningPanel listens and invalidates. |
| **E2E tests for critical flows** | Medium | `tests/critical/*` cover authStore, commandService, pluginToolRunner, offlineSyncIdempotency. No E2E for mission execute, fence upload, calibration. |
| **Explicit rate limiting on commands** | Low | No per-user or per-connection rate limit on `/api/commands/dispatch` or `/api/mavlink/vehicle/action`. |

---

## F. Duplicate / Redundant Processes

| Duplicate | Location | Impact |
|-----------|----------|--------|
| **TelemetryPanel polling** | `TelemetryPanel.tsx` | Three intervals: ~line 363 (general), ~392 (BME688 poll 8s), ~402 (another poll). Multiple overlapping timers for same panel. |
| **SpeakerPanel polling** | `SpeakerPanel.tsx` | `loadAudioStatus` at line 186 in `setInterval` (5s) + debounced output select effect. Potential for redundant `/api/audio/output/select` calls if both fire. |
| **useOfflineSync intervals** | `useOfflineSync.ts` | `heartbeatRef` (checkConnectivity) + `syncIntervalRef` (syncBacklog). Both run; acceptable if scoped differently but adds timer load. |
| **ControlDeck + MissionPlanningPanel mission polling** | `ControlDeck.tsx`, `MissionPlanningPanel.tsx` | ControlDeck has interval (~218); MissionPlanningPanel polls `/api/missions/runs/:id` when `activeRunId`. Possible overlap when both active. |
| **No-fly zone sources** | `useNoFlyZones`, `MissionPlanningPanel` | `useNoFlyZones` fetches `/api/airspace/restricted` by lat/lng; MissionPlanningPanel fetches by bbox for routing. Different shapes, both valid; not truly duplicate. |
| **Geofence zones vs airspace** | GeofencingPanel, useNoFlyZones, airspace API | Geofence zones in localStorage; airspace from OpenAIP/TFR. Intentional dual source; UI banner explains. |
| **storage.syncToGoogle** | `storage.ts` | Called from `setInterval` every 5 min and from `/api/sync/google` POST. Both paths; `syncPending` gates work. |

---

## G. Performance Issues

| Issue | Severity | File(s) | Recommendation |
|-------|----------|---------|----------------|
| **TelemetryPanel triple polling** | Medium | `TelemetryPanel.tsx` | Consolidate to one interval; fetch telemetry + BME688 in single request or single timer with batched fetches. |
| **Large panels not code-split** | Medium | `SettingsPanel.tsx` (~207KB), `MissionPlanningPanel.tsx` (~101KB) | Already lazy-loaded via home.tsx; consider further splitting tabs within Settings. |
| **routes.ts monolithic** | Low | `server/routes.ts` (~8.8k lines) | Split by domain (auth, mavlink, cloud, audio, etc.) for maintainability. |
| **MissionPlanningPanel `createWaypointsForDestination` bbox fetch** | Low | `MissionPlanningPanel.tsx` | Fetches restricted + static-restricted per click; cache by bbox if user clicks repeatedly in same area. |
| **VideoFeed detection interval** | Low | `VideoFeed.tsx` | `detectionIntervalRef` runs when detecting; ensure cleared on unmount. |
| **TopBar clock update 1s** | Low | `TopBar.tsx` | `setInterval` every 1s for clock; acceptable but consider 60s if only for display. |
| **useNoFlyZones 3min poll** | Low | `useNoFlyZones.ts` | 180000ms; reasonable for airspace. |

---

## H. Security Issues

| Issue | Severity | File(s) | Root cause | Fix |
|-------|----------|---------|------------|-----|
| **Session store in memory** | High | `server/routes.ts` (activeSessions) | Restart clears sessions; no horizontal scaling. | Use Redis or DB-backed session store. |
| **Google OAuth callback path** | Medium | `server/routes.ts` | `app.use("/api/google")` skips permission for `/callback`; intentional for OAuth flow. | Ensure callback validates state and does not leak tokens. |
| **Python/MAVLink scripts** | Medium | `server/routes.ts`, `scripts/*.py` | `execCommand`/`spawn` with user input (connectionString, etc.). `allowlistShellArg` and patterns used; verify all args validated. | Audit every `execCommand`/spawn call; ensure no unsanitized input reaches shell. |
| **/api/health unauthenticated** | Low | `server/routes.ts` | By design for Electron/health checks. | Document; optionally add simple token if needed for private deploys. |
| **Plugin tool execution** | Medium | `pluginToolRunner.ts`, routes | Plugins can run tools; permission `system_settings` required. | Ensure plugin dir and tool allowlist are strict; no arbitrary command execution. |
| **Firebase config in code** | Low | `shared/hardcodedFirebaseConfig.ts` | Hardcoded project/config. | Prefer env vars for deploy-specific config. |

---

## I. Architecture / Maintainability Issues

| Issue | Severity | Location | Recommendation |
|-------|----------|----------|----------------|
| **Monolithic routes.ts** | Medium | `server/routes.ts` | Split into route modules (auth, mavlink, cloud, audio, etc.). |
| ~~No typed API layer~~ | Medium | Client | **DONE** – `client/src/lib/api.ts` provides missionsApi, waypointsApi, dronesApi, flightSessionsApi. |
| **Dual script dirs** | Low | `script/` vs `scripts/` | Clarify: `script/build.ts` for build; `scripts/` for Python tools. |
| **Multiple sources of truth for "selected drone"** | Medium | localStorage `mouse_selected_drone`, TopBar, DroneSelectionPanel | Already centralized via events; ensure all consumers use `drone-selected` and not just localStorage. |
| **Geofence vs airspace naming** | Low | GeofencingPanel, useNoFlyZones, airspace API | Geofence = user-defined zones (localStorage + FC). Airspace = external (OpenAIP, TFR). Document in code/README. |
| **Stabilization / ML components** | Medium | AutoStabilizationController, MLStabilizationEngine, etc. | Responsibility split across components; consider consolidating or clearly documenting data flow. |

---

## J. Reliability / Silent Failure Risks

| Risk | Severity | Location | Root cause | Fix |
|------|----------|----------|------------|-----|
| **Silent fetch failures** | Medium | Multiple | `.catch(() => {})` in useDeviceContext, useOfflineSync, TopBar, SpeakerPanel, SettingsPanel. | **FIXED** – useDeviceContext, useOfflineSync log; VideoFeed mapping backend logs; remaining `.catch(() => ({}))` for JSON parse only. |
| **Mission run poll stops without clear UX** | Medium | `MissionPlanningPanel.tsx` | After 3 failures, `toast.error`; interval keeps running. `setActiveRunId(null)` clears. Ensure interval cleaned when `activeRunId` null. | Verify `useEffect` cleanup clears interval when `activeRunId` becomes null. |
| **Audio output select debounce** | Low | `SpeakerPanel.tsx` | Single debounced effect; races possible if user changes device rapidly. | 150ms debounce in place; consider 300ms if duplicates observed. |
| **Cloud sync errors** | Fixed | `server/routes.ts`, `cloudSync.ts` | Now uses `logCloudErr` instead of `.catch(() => {})`. | None. |
| **Offline backlog replay** | Medium | `useOfflineSync.ts` | Replay on reconnect; idempotency store prevents dupes. Conflicts possible if same record changed offline and on server. | Document conflict behavior; consider last-write-wins or versioning. |
| **Flight session end on page close** | Medium | ControlDeck | No `beforeunload` to auto-end session. User may close tab with active session. | Optional: prompt or background sync to end session. |

---

## K. High-Priority Fixes

1. ~~Replace remaining silent `.catch(() => {})`~~ **DONE** – useDeviceContext, useOfflineSync, VideoFeed log; logWarn in lib/logErr.ts available.
2. **Persistent session store** – Redis or DB for `activeSessions` before multi-instance or production.
3. **Mission / Optimizer invalidation** – When FlightPathOptimizerPanel applies changes, invalidate MissionPlanningPanel (event or query invalidation).
4. **Camera Feeds tab** – Either wire to real stream bridge or clearly label as "Local Preview Only"; document RTSP/WebRTC path.
5. **TelemetryPanel** – Consolidate three poll intervals into one.
6. **Security audit of execCommand/spawn** – Ensure all MAVLink/plugin args are validated.
7. **Cleanup mission run poll** – Ensure `useEffect` for `activeRunId` clears interval in cleanup.

---

## L. Recommended Refactors

1. Split `server/routes.ts` into domain route modules.
2. Introduce typed API client in `client/src/lib/api.ts` (or similar).
3. Add `mission-updated` / `waypoint-updated` events and listeners for cross-panel consistency.
4. Consider React Query for missions/waypoints to centralize cache and invalidation.
5. Document stabilization/ML hardware requirements and fallback behavior.
6. Add E2E tests for: mission execute, fence upload, calibration flow.

---

## Appendix 1: Prioritized Bug List

| # | Title | Severity |
|---|-------|----------|
| 1 | Session store in memory | Critical |
| 2 | Camera Feeds tab not wired to drone streams | High |
| 3 | ~~Silent `.catch(() => {})` in frontend~~ | **FIXED** |
| 4 | ~~MissionPlanningPanel ↔ FlightPathOptimizerPanel no invalidation~~ | **FIXED** |
| 5 | TelemetryPanel triple polling | Medium |
| 6 | Mission run poll cleanup on unmount | Medium |
| 7 | ~~Storage sync interval when Google not configured~~ | **FIXED** |
| 8 | Plugin/exec security audit | Medium |

---

## Appendix 2: Missing Implementations List

- Persistent session store
- ~~Typed API client~~ **DONE** – api.ts with missionsApi, waypointsApi, dronesApi, flightSessionsApi
- OpenAPI spec
- ~~Mission/waypoint cache invalidation between panels~~ **FIXED** – mission-updated event
- E2E tests for mission, fence, calibration
- Rate limiting on command APIs
- `beforeunload` handler for flight session

---

## Appendix 3: Duplicate / Redundancy List

- TelemetryPanel: 3 intervals
- SpeakerPanel: status poll + debounced output select
- ControlDeck + MissionPlanningPanel: both can poll mission state
- useOfflineSync: heartbeat + sync intervals
- storage.syncToGoogle: interval + manual POST

---

## Appendix 4: Performance Optimization List

1. Consolidate TelemetryPanel intervals
2. Consider caching airspace bbox responses in MissionPlanningPanel
3. Split SettingsPanel into smaller lazy chunks
4. Reduce TopBar clock interval if acceptable
5. Split server routes by domain

---

## Appendix 5: Backend Functions That Exist But May Be Unused

| Function/Route | Notes |
|---------------|-------|
| `/api/plugins/sdk/validate` | Used by PluginToolchainPanel |
| `/api/plugins/sdk/package` | Used by PluginToolchainPanel |
| `/api/backup/gui-config` | Used by GUIConfigPanel |
| `syncDataToSheets` (Google Sheets) | Called from storage; optional |
| `runMavlinkParamBridge` | Used for params get/set |
| `runMavlinkVehicleControl` | Used for vehicle actions |
| Flight dynamics engine | `flightDynamics.ts` – usage not fully traced |

---

## Appendix 6: UI Features Present But Not Fully Wired

| Page/Control | Expected | Actual | Status |
|--------------|----------|--------|--------|
| Camera Feeds tab – GIMBAL/THERMAL tiles | Drone camera streams | Local webcam preview only | Partial |
| VideoFeed – RTSP stream | Live RTSP | Placeholder + ffmpeg hint; no WebRTC | Partial |
| Object tracking "lock" | Gimbal follow | Client-side box only; no MAVLink | Partial |
| 3D Mapping – Generate | Full 3D model | API exists; pipeline not verified | Partial |
| Stabilization actuators | Hardware actuation | API calls; hardware dependency | Partial |
| GPS-denied nav | Real ML nav | Commands dispatched; pipeline unclear | Partial |

---

## Appendix 7: Code Paths That May Fail Silently

- ~~`useDeviceContext` fetch `/api/runtime-config`~~ **FIXED** – logs on catch
- ~~`useOfflineSync` backlog fetch~~ **FIXED** – logs + toast on failure
- `TopBar` session/logout – uses `.catch(() => ({}))` for JSON parse fallback; fetch errors handled
- `SettingsPanel` fetchEvents – uses `.catch(() => ({}))` for JSON parse fallback
- `SpeakerPanel` – uses `.catch(() => ({}))` for JSON parse fallback
- ~~`VideoFeed` mapping backend~~ **FIXED** – console.warn on catch
- `firebaseAdmin` app delete – server-side; low priority
- Mission run poll – after 3 failures shows toast but continues polling

---

## Appendix 8: Button / Control Audit Table

| Page / Screen | Control Name | Expected Action | Actual Wiring Found | Status | Issue Summary |
|---------------|--------------|-----------------|---------------------|--------|---------------|
| Map | VideoFeed camera toggle | Switch FPV/Gimbal/Thermal/Webcam | `setActiveCam` | Working | — |
| Map | Show Demo View | Show static demo image | `setShowPlaceholder(false)` | Working | — |
| Mission Plan | Execute Mission | Run mission on FC | `fetch(/api/missions/:id/execute)` | Working | — |
| Mission Plan | Stop Mission | Stop active run | `fetch(/api/missions/runs/:id/stop)` | Working | — |
| Mission Plan | Add destination (map click) | Add waypoints with no-fly routing | `createWaypointsForDestination` | Working | — |
| Mission Plan | Upload to FC | Upload mission to vehicle | `fetch(/api/mavlink/mission/upload)` | Working | — |
| Geofencing | Upload to FC | Upload fence | `fetch(/api/mavlink/fence/upload)` | Working | — |
| Geofencing | Download FC Fence | Download from FC | `fetch(/api/mavlink/fence/download)` | Working | — |
| Control Deck | Start Session | Start flight session | `apiRequest(POST, /api/flight-sessions/start)` | Working | — |
| Control Deck | End Session | End flight session | `apiRequest(POST, /api/flight-sessions/end)` | Working | — |
| Control Deck | Arm / Disarm / RTL | Dispatch command | `dispatchBackendCommand` | Working | — |
| Speaker | TTS, Buzzer, Live, Drone Mic | Audio control | `apiJson(/api/audio/*)` | Working | — |
| Speaker | Output device select | Set audio output | `apiJson(POST, /api/audio/output/select)` | Working | Debounced |
| Calibration | Start / Cancel | Calibrate sensors | `fetch(/api/mavlink/calibration/*)` | Working | — |
| Tracking | Start detection | Run COCO-SSD on webcam | Client-side TF.js | Working | No backend |
| Tracking | Lock target | Lock UI box | `setLockedTargets` | Working | No gimbal |
| Camera Feeds | Connect Local Camera | Start webcam | `getUserMedia` | Working | Not drone feed |
| Camera Feeds | Reset 3D / Generate 3D | Mapping actions | `fetch(/api/mapping/3d/*)` | Partial | Pipeline unverified |
| Settings | All tabs | Various | Multiple fetch calls | Working | — |
| Optimizer | Analyze / Apply | Optimize mission | `fetch(/api/missions)` | Partial | No mission invalidation |

---

## Appendix 9: Final Readiness Score

**62 / 100**

- **Core flight and mission flows:** 75/100 – Wired and functional.
- **UI completeness:** 55/100 – Many features partial or local-only.
- **Reliability:** 55/100 – Silent failures, in-memory sessions.
- **Security:** 65/100 – Auth in place; session persistence and exec audit needed.
- **Performance:** 60/100 – Duplicate polling; large panels.
- **Maintainability:** 55/100 – Monolithic routes; no typed API.

---

*End of audit report.*
