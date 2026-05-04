# M.O.U.S.E Ground Control Station

## Overview

M.O.U.S.E (Multi-purpose Operational Unmanned Aerial System for Emergency Response & Environmental Monitoring) is a ground control station for autonomous drone control. It provides real-time telemetry, mission planning, object tracking, and two-way communication, with support for GPS-denied environments. The system operates on Raspberry Pi for onboard control and on desktop/laptop for the primary ground control interface, aiming for robust, versatile, and AI-enhanced drone operations in critical situations.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React with TypeScript (Vite)
- **UI/UX**: shadcn/ui (Radix UI) for components, Tailwind CSS for styling, Wouter for routing.
- **State Management**: TanStack React Query.
- **Mapping**: Leaflet for satellite, 2D, and hybrid map views.
- **Deployment**: Ground Control Mode (desktop/laptop), Onboard Mode (Raspberry Pi), Standalone (local JSON), and Desktop Application (Electron).

### Backend
- **Runtime**: Node.js with Express
- **Language**: TypeScript (ESM modules)
- **Real-time Communication**: WebSocket server (`ws`).
- **API Design**: RESTful endpoints.

### Data Storage
- **Local**: JSON files (`./data`) for offline-first.
- **Cloud Integration**: Google Drive (files), Google Sheets (structured data) for backup and optional Firebase for real-time sync, remote control, and multi-device collaboration.
- **Schema**: Zod-based type definitions (`shared/schema.ts`).
- **Auto-sync**: Data automatically syncs to Google Drive/Sheets when online.

### Key Features
- **Multi-drone Management**: Control multiple drones with real-time status, geofencing, and switching.
- **Real-time Telemetry**: Displays altitude, speed, attitude, and motor data.
- **Interactive Map**: Displays drone positions, waypoints, and flight paths.
- **Mission Planning**: Waypoint management with various actions.
- **AI-powered Object Tracking**: TensorFlow.js COCO-SSD for object detection and tracking with confidence boosting.
- **Audio Broadcast System**: Operator mic and TTS fan out from the GCS to every connected tab via WebSocket. `client/src/components/audio/GlobalAudioReceiver.tsx` is mounted globally in `App.tsx` and listens for two CustomEvents that `TopBar.tsx` dispatches from the WS feed: `audio-chunk-incoming` (base64 mic chunks) and `audio-tts-broadcast` (TTS text). Mic chunks are fed into a single MediaSource (`audio/webm;opus`) for continuous low-latency playback, with an AudioContext fallback for codecs MediaSource can't handle (raw PCM/WAV). The receiver caps the SourceBuffer at ~30 s to prevent QuotaExceededError on long streams, prunes old data on every `updateend`, registers a one-shot click/keydown/touchstart listener to satisfy autoplay policies, queues failed AudioContext decodes until the context is resumed by a user gesture, and revokes ObjectURLs / removes listeners on teardown. The operator's own tab is prevented from echoing itself via a `sessionStorage.mouse_audio_sender` flag set by `SpeakerPanel.tsx` on Start Live and cleared on Stop, MediaRecorder error, the recorder's `stop` event, and component unmount. Hardware paths: Pi GPIO speaker, USB speaker, and Orange Cube+ buzzer.
- **Gamepad / Joystick Control**: USB and Bluetooth Xbox/PS controllers polled in `client/src/components/controls/ControlDeck.tsx` via the standard `navigator.getGamepads()` API. 18 actions defined in `shared/gamepadMapping.ts` (critical / flight / payload / axis groups) with safe defaults that map emergency stop to a button you can't accidentally hit with a thumbstick. Mappings are persisted to `localStorage.mouse_gamepad_mapping`, broadcast across panels via the `gamepad-mapping-changed` window event, and edited through `GamepadMappingDialog.tsx` (press-to-assign, axis invert, reset-to-defaults). `normalizeMapping()` rejects any stored binding whose `kind` doesn't match the action's default kind — so a corrupt config that tries to bind emergency stop to an axis silently falls back to the safe default. Per-action cooldowns prevent double-fire while ensuring `emergency_stop` always bypasses cooldowns and is never blocked by another in-flight action.
- **Flight Controls**: Arm/disarm, takeoff, land, RTL, emergency stop.
- **Automatic Flight Recording**: Auto-starts/ends on takeoff/landing, captures telemetry, syncs to Google Sheets.
- **Hardware Control**: Servo/gripper control via Raspberry Pi GPIO.
- **Environmental Monitoring**: BME688 sensor integration for temperature, humidity, pressure, IAQ, and AI-based gas classification.
- **Google Integration**: Sheets backup, Drive for video, account management.
- **User Authentication**: Role-based access (admin, operator, viewer).
- **Team Communication**: Real-time messaging with Google Sheets backup.
- **Automation Scripts**: Custom flight automation with triggers.
- **GPS-Denied Navigation**: ML navigation engine with visual scene matching, IMU, and landmark recognition.
- **Flight Log Management**: Records, categorizes, replays, and provides statistics.
- **GUI Configuration**: Customizable interface with themes and Google Sheets backup.
- **Flight Path Optimizer**: Analyzes missions with weather and terrain data.
- **ML Flight Stabilization System**: Multi-architecture stabilization with Extended Kalman Filter, neural network for disturbance prediction, adaptive PID, and compensation for payload/weather.
- **Unified App-Config**: Centralized backend source-of-truth for every operator-facing setting (theme, GUI layout, hardware/GPIO, primary camera, AR HUD, motor count, ML stabilization config, base location, input mappings, geofence cache, telemetry sim, comms primary). Registry lives in `shared/appConfig.ts`. Reads via `GET /api/app-config`, writes via `PUT/PATCH /api/app-config[/<key>]` (system_settings perm). Each write persists to Postgres `settings` table, mirrors to Firebase RTDB at `/app_config/<key>`, mirrors to Firestore `app_config/<key>`, and broadcasts WS `app_config_updated` so all connected GCS instances reflect the change in-flight without a reload. RTDB child_added+child_changed listener fans external admin changes back into the local cache (origin-tagged to prevent loops). Client write-through bridges (in `client/src/lib/centralConfig.ts` + `useAppConfig` hook) automatically migrate legacy localStorage keys, mirror local writes to the backend, and apply incoming WS updates to localStorage so existing panels need no refactor. Communication board is now RTDB-primary: every message is also persisted at `/messages/<id>`.

### Hardware Configuration (Target)
- **Companion Computer**: Raspberry Pi 5 (16GB)
- **Flight Controller**: Orange Cube+ with ADSB Carrier Board
- **GPS**: Here3+ GPS Module (CAN-connected)
- **Lidar**: LW20/HA
- **Camera/Gimbal**: Skydroid C12 2K
- **Propulsion**: Mad Motors XP6S Arms (x4)

## External Dependencies

- **Data Storage**: Local JSON files, Google Drive API, Google Sheets API.
- **Frontend Libraries**: Leaflet, Radix UI, TanStack React Query, TensorFlow.js (COCO-SSD), shadcn/ui.
- **Build Tools**: Vite, esbuild, TypeScript, Electron.
- **Real-time Communication**: WebSocket (`ws`).
- **Regulatory Data**: FAA GeoJSON files, Live TFR endpoint (`tfr.faa.gov`).
- **Camera & Detection**: Tesseract.js v5 (OCR), TensorFlow.js COCO-SSD, MAVLink for gimbal control.
- **Python Dependencies**: Python 3.11, `pymavlink`, `Pillow`, `piexif`.