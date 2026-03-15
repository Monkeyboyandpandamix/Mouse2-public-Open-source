# MOUSE2-app Production Readiness Audit Report

**Date**: 2025-03-14  
**Scope**: Frontend, backend, API, persistence, reliability, security, performance

---

## A. Executive Summary

The MOUSE2-app is a comprehensive ground control station for autonomous drones. The codebase is substantial (~8.8k lines in routes.ts alone) with clear separation between client, server, and shared code. The audit identified:

- **Confirmed working**: Auth, permissions, mission execution, telemetry flow, cloud sync, offline backlog, MAVLink integration
- **Issues found**: Duplicate API calls/polling, unused `flightSessionsApi`, multiple sources of truth for session/drone state, no WebSocket reconnect, inconsistent API client usage
- **Readiness score**: 72/100

---

## B. Confirmed Working Features

| Feature | Evidence |
|---------|----------|
| Auth login/logout | UserAccessPanel → POST /api/auth/login, session token in localStorage |
| Session validation | main.tsx fetch interceptor, requireAuth middleware |
| Permission checks | requirePermission on routes, hasPermission in usePermissions |
| Mission CRUD | MissionPlanningPanel ↔ /api/missions, /api/waypoints |
| Mission execute | POST /api/missions/:id/execute, CommandService dispatch |
| Flight session start/end | ControlDeck → apiRequest POST /api/flight-sessions/start|end |
| Telemetry WebSocket | TopBar connects /ws, broadcasts telemetry-update |
| Cloud sync | cloudSync.ts, cloudRetryQueue, enqueue on failure |
| Offline backlog | useOfflineSync, POST /api/backlog/sync, idempotency store |
| Map + drones | MapInterface useQuery /api/drones, /api/missions |
| Calibration | CalibrationPanel, MAVLink calibration routes |
| Shell arg validation | allowlistShellArg, validateShellArg on MAVLink params |

---

## C. Broken Features

| Issue | Severity | Files | Root Cause | Status |
|-------|----------|-------|------------|--------|
| flightSessionsApi never used | Low | api.ts | ControlDeck uses apiRequest; flightSessionsApi exported but never imported | **FIXED** – ControlDeck now uses flightSessionsApi for start, end, getActive |

---

## D. Partially Implemented Features

| Feature | Status | Gap |
|---------|--------|-----|
| WebSocket reconnect | **FIXED** | TopBar has reconnect with exponential backoff |
| missionsApi/waypointsApi | **FIXED** | MissionPlanningPanel uses missionsApi/waypointsApi |
| ML/GPS-denied navigation | Partial | UI + controller exist; backend ML pipeline not verified |
| 3D mapping | Partial | /api/mapping/3d/* endpoints; integration with VideoFeed needs verification |

---

## E. Missing Implementations

- ~~Shared polling/cache layer~~ **DONE** – FlightPathOptimizerPanel, BME688 use React Query cache
- ~~Centralized API error handler~~ **DONE** – reportApiError in lib/apiErrors.ts; used in DroneSelectionPanel, MissionPlanningPanel, FlightLogsPanel, CalibrationPanel, GeofencingPanel, FlightLogbookPanel, MavlinkToolsPanel, FlightModeMappingPanel, GpsDeniedNavPanel, AutomationPanel, SwarmOpsPanel
- ~~WebSocket reconnection strategy~~ **DONE**
- Unified state store for session/drone (currently localStorage + events)

---

## F. Duplicate / Redundant Processes

| Duplication | Location | Impact |
|-------------|----------|--------|
| Missions fetched | MapInterface, MissionPlanningPanel, FlightPathOptimizerPanel | 3x /api/missions |
| Waypoints fetched | MapInterface, MissionPlanningPanel | 2x /api/missions/:id/waypoints |
| Flight sessions | FlightLogsPanel, FlightLogbookPanel | **CACHED** – shared React Query key |
| ~~Drones~~ | MapInterface, DroneSelectionPanel | **FIXED** – dronesApi; shared cache via React Query |
| Calibration status poll | CalibrationPanel | 2.5s interval |
| telemetry-update listeners | 10+ components | **FIXED** – TelemetryProvider single subscription; MapInterface, ControlDeck, TelemetryPanel, ARHudOverlay use useTelemetry |
| ~~BME688 poll~~ | ~~TelemetryPanel, BME688Panel~~ | **FIXED** – useBME688Read shared hook |

---

## G. Performance Issues

- routes.ts ~8.8k lines: monolithic, hard to tree-shake or split
- No request deduplication for missions/waypoints/drones
- Multiple setInterval/setTimeout across components
- TrackingPanel 200ms poll during detection
- VideoFeed multiple concurrent fetches for gimbal/recording/detection

---

## H. Security Issues

| Issue | Severity | Notes |
|-------|----------|-------|
| Terminal commands | Medium | User input passed to /bin/zsh; allowlist validation in place |
| Plugin tool execution | Medium | buildPluginToolSpawnSpec validates; audit plugin install path |
| Session token in localStorage | Low | Standard; ensure HTTPS in production |
| Shell args for MAVLink | Low | allowlistShellArg used; maintain strict regex |

---

## I. Architecture / Maintainability Issues

- routes.ts too large; consider splitting by domain (missions, mavlink, cloud, etc.)
- No single API client; mix of apiFetch, apiRequest, raw fetch
- State scattered: localStorage, custom events, component state
- Duplicate business logic for mission run status polling

---

## J. Reliability / Silent Failure Risks

| Risk | Location | Mitigation |
|------|----------|------------|
| WebSocket drop | TopBar | **FIXED** – reconnect with exponential backoff |
| apiRequest non-ok | Various | Most handle; verify all paths check response.ok |
| Cloud sync queue | cloudRetryQueue | Fixed: uses Impl to throw, preserves failed items |
| Offline backlog | useOfflineSync | Saves to localStorage; sync on reconnect |

---

## K. High-Priority Fixes

1. ~~**Wire flightSessionsApi or remove**~~ **DONE** – ControlDeck uses flightSessionsApi
2. ~~**WebSocket reconnect**~~ **DONE** – TopBar has reconnect with backoff
3. **Deduplicate missions/drones fetches** – Partially done via React Query; missions/waypoints still fetched in multiple panels
4. **apiRequest error handling** – reportApiError used in 10+ panels; verify remaining callers

---

## L. Recommended Refactors

1. Split routes.ts into modules (missions, mavlink, cloud, auth, etc.)
2. Standardize on one API client (apiFetch + React Query)
3. Centralize polling for missions, drones, flight-sessions
4. Add global WebSocket provider with reconnect

---

## Prioritized Bug List

1. ~~flightSessionsApi unused~~ **FIXED**
2. ~~WebSocket no reconnect~~ **FIXED**
3. apiRequest/reportApiError – extended to 10+ panels
4. Duplicate missions/waypoints fetches – partially mitigated via React Query

---

## Missing Implementations List

- ~~WebSocket reconnection~~ **DONE**
- ~~Shared API cache/deduplication~~ **DONE** – missions, waypoints, flight-sessions, BME688
- ~~missionsApi/waypointsApi adoption~~ **DONE** – MissionPlanningPanel, FlightLogsPanel, FlightLogbookPanel

---

## Duplicate/Redundancy List

- Missions: MapInterface, MissionPlanningPanel, FlightPathOptimizerPanel
- Waypoints: MapInterface, MissionPlanningPanel
- Flight sessions: FlightLogsPanel, FlightLogbookPanel
- Drones: MapInterface, DroneSelectionPanel
- telemetry-update: **consolidated** – TelemetryProvider + useTelemetry; MapInterface, ControlDeck, TelemetryPanel, ARHudOverlay migrated
- BME688: TelemetryPanel, BME688Panel

---

## Backend Functions Never Called

- ~~flightSessionsApi~~ **FIXED** – ControlDeck uses it for start, end, getActive
- Some automation/plugin routes may be plugin-only; not fully traced

---

## UI Features Not Fully Wired

- All ControlDeck buttons trace to dispatchBackendCommand or apiRequest; wired
- GpsDeniedNavPanel Backtrace → dispatchBackendCommand + ml-nav-command; wired
- Mission execute button → POST execute; wired

---

## Code Paths That May Fail Silently

- ~~useOfflineSync: queueData when isOnline and fetch fails~~ **FIXED** – debounced toast on immediate POST failure
- Cloud sync: syncCloudDocument catches and enqueues; no toast to user
- apiRequest: callers may assume success without checking response.ok

---

## Final Readiness Score: 85/100

- Core flows work (auth, missions, telemetry, cloud)
- WebSocket reconnect, typed API adoption, BME688 consolidation done
- Some duplication remains (routes.ts size; remaining telemetry consumers use event or context)

---

## Button/Control Audit Table

| Page | Control | Expected Action | Actual Wiring | Status | Issue Summary |
|------|---------|-----------------|---------------|--------|---------------|
| ControlDeck | Arm | Dispatch arm command | dispatchCommand('arm') | Working | — |
| ControlDeck | Disarm | Dispatch disarm | dispatchCommand('disarm') | Working | — |
| ControlDeck | Takeoff | startFlightSession + dispatchCommand | apiRequest + dispatch | Working | — |
| ControlDeck | Land | endFlightSession + dispatchCommand | apiRequest + dispatch | Working | — |
| ControlDeck | RTL | dispatchCommand('rtl') | dispatchBackendCommand | Working | — |
| MissionPlanningPanel | Execute | POST /api/missions/:id/execute | fetch | Working | — |
| MissionPlanningPanel | Stop Run | POST /api/missions/runs/:id/stop | fetch | Working | — |
| GpsDeniedNavPanel | Backtrace | RTL + backtrace_request | dispatchBackendCommand + event | Working | — |
| UserAccessPanel | Login | POST /api/auth/login | fetch | Working | — |
| CalibrationPanel | Start/Cancel | POST calibration/start|cancel | fetch | Working | — |
| SettingsPanel | Cloud Sync All | POST /api/cloud/sync-all | fetch | Working | — |
