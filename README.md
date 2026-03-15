# M.O.U.S.E Ground Control Station

**M**ulti-purpose **O**perational **U**nmanned **A**erial **S**ystem for **E**mergency Response & Environmental Monitoring

A comprehensive ground control station for autonomous drone control with Orange Cube+ flight controllers running on Raspberry Pi 5.

---

## Table of Contents

1. [Overview](#overview)
2. [Key Features](#key-features)
3. [Application Capabilities (Current)](#application-capabilities-current)
4. [Complete Function Index (All)](#complete-function-index-all)
5. [System Requirements](#system-requirements)
6. [Quick Start](#quick-start)
7. [Installation Without Replit](#installation-without-replit)
8. [Environment Variables & API Keys](#environment-variables--api-keys)
9. [Third-Party Services](#third-party-services)
10. [Security Features](#security-features)
11. [User Management](#user-management)
12. [Operating Instructions](#operating-instructions)
13. [Flight Controls Reference](#flight-controls-reference)
14. [Map Controls Reference](#map-controls-reference)
15. [Settings Configuration](#settings-configuration)
16. [Hardware Configuration](#hardware-configuration)
17. [Project Structure](#project-structure)
18. [Troubleshooting & Common Errors](#troubleshooting--common-errors)
19. [Dependency Issues](#dependency-issues)
20. [Firebase Cloud Sync](#firebase-cloud-sync)
21. [Web Deployment (Firebase App Hosting)](#web-deployment-firebase-app-hosting)
22. [Redeploy Web App (Latest)](#redeploy-web-app-latest)
23. [New Cloud/Audio APIs](#new-cloudaudio-apis)

---

## Overview

M.O.U.S.E is a deployment-ready ground control station designed for:
- Emergency response operations
- Environmental monitoring missions
- Search and rescue operations
- Infrastructure inspection
- Agricultural surveys
- Wildlife monitoring

The system operates in **offline-first mode** using local JSON storage with optional cloud backup to Google Drive/Sheets when internet is available.

---

## Key Features

### Core Functionality
- Real-time telemetry monitoring (altitude, speed, attitude, motor data)
- Mission planning with waypoint management
- Interactive map with satellite/2D/hybrid views
- AI-powered object tracking (TensorFlow.js COCO-SSD)
- Geofencing with breach actions
- Two-way audio communication
- Multi-drone management

### Advanced Features
- GPS-denied navigation (visual odometry, dead reckoning)
- Multi-sensor verification (dual GPS, multiple compasses)
- Camera-based and LiDAR obstacle detection
- ADS-B aircraft traffic awareness
- Custom automation scripts
- Team communication with direct messaging

### Storage & Backup
- **Offline-First**: All data stored locally in JSON files
- **No Database Required**: Works without PostgreSQL or any database
- **Optional Cloud Sync**: Automatic backup to Google Drive/Sheets

---

## Application Capabilities (Current)

### Flight and Mission Operations
- Mission create/edit/delete with waypoint sequencing and bulk utilities
- Manual waypoint insertion from map click, coordinate input, or destination search
- Mission upload/download/validate/diff with MAVLink bridge
- Flight path optimization with apply-back into mission plans
- Geofence management and no-fly/restricted airspace checks with override workflow

### Maps, Airspace, and Situational Awareness
- Real-time map with drone/operator location, heading, trails, and mission path display
- FAA regulatory GeoJSON overlays with per-layer toggles and color coding
- Configurable airspace display radius (default 30 miles, adjustable in Settings)
- No-fly zone legend and restricted airspace visualization overlays
- Multi-drone map presence for operational awareness

### Control, Telemetry, and Safety
- Arm/disarm and vehicle mode actions via control deck + MAVLink endpoints
- Live telemetry panels (attitude, heading, altitude, speed, battery, motor/sensor feeds)
- Emergency workflows and stabilization/navigation assist modules
- Health/diagnostic streaming and flight/session logging

### Hardware and Integration
- MAVLink tooling (params, calibration, rally/fence/mission workflows)
- RTK/NTRIP profile management and reconnect/start/stop flows
- Swarm operations (group actions, sync action, formation planning helpers)
- Plugin toolchain panel and runtime plugin state support

### Camera, Media, and Tracking
- Video feed operations and capture metadata logging
- AI object tracking panel (person/vehicle/animal/aircraft/package classes)
- Media asset lifecycle tracking with cloud/offline sync status fields

### Communications
- Team messaging with direct-message visibility filtering
- Audio controls for TTS/buzzer/live stream/drone mic session bridge
- Operator action telemetry (login/logout/audio session actions) for admin visibility

### Data, Cloud, and Offline Behavior
- Offline-first local storage for core operations
- Firebase cloud sync for missions, drones, telemetry, logs, media metadata, and messages
- Realtime cloud awareness endpoint for cross-operator views
- Admin dashboard cloud endpoint for fleet-wide audit visibility
- Offline media staging and automatic retry to cloud when connectivity returns

### UX and Deployment
- Role-gated UI panels with server-side permission checks on critical API writes/actions
- App Hosting deployment support for web operators
- Electron desktop runtime for integrated local server + UI operation

---

## Complete Function Index (All)

This section is the exhaustive functional inventory of the current app surface.

### Frontend Modules and Panels (Loaded in `client/src/pages/home.tsx`)
- `MapInterface`
- `VideoFeed`
- `ControlDeck`
- `TelemetryPanel`
- `MissionPlanningPanel`
- `FlightPathOptimizerPanel`
- `TrackingPanel`
- `SpeakerPanel`
- `FlightLogsPanel`
- `FlightLogbookPanel`
- `BME688Panel`
- `AutomationPanel`
- `TerminalCommandsPanel`
- `FlightControllerParamsPanel`
- `CalibrationPanel`
- `SwarmOpsPanel`
- `GeofencingPanel`
- `StabilizationPanel`
- `GpsDeniedNavPanel`
- `DroneSelectionPanel`
- `UserAccessPanel`
- `GUIConfigPanel`
- `SettingsPanel`

### Settings Panel: Full Functional Surface
- `General`: system profile, startup behavior, core UI/runtime options
- `Hardware`: motor/airframe/hardware setup workflow with dependent parameter updates
- `Backup`: Google Sheets backup status and manual sync
- `Storage`: Google Drive media storage, Firebase Cloud manager, account switching
- `Operations`: integrated Operations Console + Full Debug Console (live command dispatch, runtime/service health, database responsiveness)
- `Advanced`: one-time stack setup modules
- `Advanced > Mode Setup`: `FlightModeMappingPanel`
- `Advanced > MAVLink Tools`: `MavlinkToolsPanel`
- `Advanced > RTK / NTRIP`: `RtkNtripPanel`
- `Advanced > Plugins`: `PluginToolchainPanel`
- `Advanced > MP Parity`: `MissionPlannerParityPanel`
- `Connections`: USB/GPIO/CAN/WiFi links, telemetry wiring
- `Sensors`: sensor feature toggles + data channel configuration
- `Input`: joystick/radio/manual control bindings
- `Camera`: camera source/stream/capture behavior
- `Failsafe`: disarm/RTL/safety guard behavior
- `Network`: cloud link and remote connectivity behavior
- `Firmware`: firmware catalog, flashing workflow, status

### Sidebar/Route-Level Functional Areas
- `map`
- `mission`
- `optimizer`
- `tracking`
- `payload`
- `feeds`
- `logs`
- `logbook`
- `environment`
- `scripts`
- `terminal`
- `fcparams`
- `calibration`
- `swarm`
- `users`
- `geofence`
- `guiconfig`
- `settings`
- `stabilization`
- `gpsnav`

### Runtime/Hardware Script Capabilities (`/scripts`)
- `runtime_bootstrap.py`
- `mavlink_vehicle_control.py`
- `mavlink_mission.py`
- `mavlink_params.py`
- `mavlink_calibration.py`
- `mavlink_fence.py`
- `mavlink_rally.py`
- `mavlink_firmware.py`
- `mavlink_dataflash.py`
- `mavlink_inspector.py`
- `mavlink_geotag.py`
- `servo_control.py`
- `bme688_monitor.py`
- `setup-gpio-access.sh`
- `build-standalone.sh`
- `build-standalone.ps1`

### Complete Backend API Function List (`server/routes.ts`)

```text
delete /api/backlog/:id
delete /api/backlog/clear
delete /api/drive/files/:fileId
delete /api/drones/:id
delete /api/firmware/catalog/:id
delete /api/flight-logs/:id
delete /api/flight-sessions/:id
delete /api/google/accounts/:id
delete /api/mavlink/rtk/profiles/:id
delete /api/media/:id
delete /api/messages/:id
delete /api/missions/:id
delete /api/waypoints/:id
get /api/airspace/restricted
get /api/airspace/sources
get /api/airspace/static-restricted
get /api/airspace/tfr
get /api/audio/drone-mic
get /api/audio/live/status
get /api/audio/output/devices
get /api/audio/session
get /api/audio/status
get /api/backlog
get /api/backup/google-sheets/status
get /api/bme688/debug
get /api/bme688/read
get /api/bme688/status
get /api/camera-settings
get /api/chat-users
get /api/cloud/admin-dashboard
get /api/cloud/awareness
get /api/cloud/status
get /api/drive/files
get /api/drive/status
get /api/drones
get /api/drones/:id
get /api/firmware/catalog
get /api/firmware/status
get /api/flight-logs/recent
get /api/flight-sessions
get /api/flight-sessions/:id
get /api/flight-sessions/:id/logs
get /api/flight-sessions/active
get /api/geocode
get /api/google/accounts
get /api/google/auth-url
get /api/google/callback
get /api/google/configured
get /api/google/status
get /api/health
get /api/integrations/verify
get /api/mapping/3d/model/latest
get /api/mapping/3d/status
get /api/mavlink/airframe/profiles
get /api/mavlink/calibration/status
get /api/mavlink/dataflash/file/:name
get /api/mavlink/dataflash/list
get /api/mavlink/fence/download
get /api/mavlink/gps-inject/status
get /api/mavlink/inspector/live
get /api/mavlink/inspector/snapshot
get /api/mavlink/mission/download
get /api/mavlink/mode-mapping
get /api/mavlink/optional-hardware/profiles
get /api/mavlink/params
get /api/mavlink/params/:name
get /api/mavlink/params/export
get /api/mavlink/radio-sik/modem-profiles
get /api/mavlink/radio-sik/status
get /api/mavlink/rally/download
get /api/mavlink/rtk/profiles
get /api/mavlink/rtk/profiles/export
get /api/mavlink/rtk/status
get /api/mavlink/serial-passthrough/status
get /api/media
get /api/media/:id
get /api/messages
get /api/messages/history
get /api/missions
get /api/missions/:id
get /api/missions/:missionId/waypoints
get /api/motor-telemetry/recent
get /api/plugins
get /api/reverse-geocode
get /api/runtime-config
get /api/sensor-data/:sensorType
get /api/servo/status
get /api/settings/:category
get /api/stabilization/frame-geometries
get /api/stabilization/params
get /api/stabilization/status
patch /api/backlog/:id/synced
patch /api/camera-settings
patch /api/drones/:id
patch /api/drones/:id/location
patch /api/flight-sessions/:id
patch /api/mavlink/params/:name
patch /api/media/:id
patch /api/messages/:id
patch /api/missions/:id
patch /api/waypoints/:id
post /api/airspace/authorization/validate
post /api/audio/buzzer
post /api/audio/drone-mic
post /api/audio/live/start
post /api/audio/live/stop
post /api/audio/output/select
post /api/audio/session/join
post /api/audio/session/leave
post /api/audio/tts
post /api/auth/login
post /api/auth/logout
post /api/backlog
post /api/backlog/sync
post /api/backup/google-sheets
post /api/backup/gui-config
post /api/cloud/media/sync-pending
post /api/cloud/media/upload
post /api/cloud/sync-all
post /api/cloud/test
post /api/connections/test
post /api/drive/upload
post /api/drones
post /api/firmware/catalog
post /api/firmware/catalog/install
post /api/firmware/flash
post /api/firmware/recover-bootloader
post /api/flight-logs
post /api/flight-sessions/end
post /api/flight-sessions/start
post /api/google/switch
post /api/mapping/3d/frame
post /api/mapping/3d/reconstruct
post /api/mapping/3d/reset
post /api/mavlink/airframe/apply
post /api/mavlink/airframe/reconfigure
post /api/mavlink/calibration/cancel
post /api/mavlink/calibration/start
post /api/mavlink/command
post /api/mavlink/dataflash/analyze
post /api/mavlink/dataflash/download
post /api/mavlink/dataflash/replay
post /api/mavlink/fence/upload
post /api/mavlink/geotag/run
post /api/mavlink/gps-inject/start
post /api/mavlink/gps-inject/stop
post /api/mavlink/manual-control
post /api/mavlink/mission/diff
post /api/mavlink/mission/upload
post /api/mavlink/mission/validate
post /api/mavlink/mode-mapping/apply
post /api/mavlink/optional-hardware/apply
post /api/mavlink/params/compare
post /api/mavlink/params/import
post /api/mavlink/radio-sik/apply
post /api/mavlink/radio-sik/apply-verify
post /api/mavlink/radio-sik/modem-apply-profile
post /api/mavlink/radio-sik/modem-query
post /api/mavlink/rally/upload
post /api/mavlink/rtk/profiles
post /api/mavlink/rtk/profiles/import
post /api/mavlink/rtk/reconnect
post /api/mavlink/rtk/start
post /api/mavlink/rtk/stop
post /api/mavlink/serial-passthrough/start
post /api/mavlink/serial-passthrough/stop
post /api/mavlink/swarm/action
post /api/mavlink/swarm/formation-mission
post /api/mavlink/swarm/formation-plan
post /api/mavlink/swarm/sync-action
post /api/mavlink/vehicle/action
post /api/media
post /api/messages
post /api/messages/sync
post /api/missions
post /api/motor-telemetry
post /api/plugins/:id/enable
post /api/plugins/:id/run-tool
post /api/plugins/sdk/create-template
post /api/plugins/sdk/package
post /api/plugins/sdk/validate
post /api/sensor-data
post /api/servo/control
post /api/settings
post /api/stabilization/compute
post /api/stabilization/environment
post /api/stabilization/motors
post /api/stabilization/params
post /api/stabilization/payload
post /api/stabilization/sensors
post /api/sync/google
post /api/telemetry/record
post /api/waypoints
```

---

## System Requirements

### Minimum Requirements
- **Node.js**: v18 or higher (v20 LTS recommended)
- **RAM**: 2GB minimum, 4GB recommended
- **Storage**: 500MB for application, additional for flight logs/media
- **Browser**: Chrome, Firefox, Edge, or Safari (latest versions)

### Supported Platforms
| Platform | Tested | Notes |
|----------|--------|-------|
| Windows 10/11 | Yes | Use start-windows.bat |
| Ubuntu 20.04+ | Yes | Use start-linux.sh |
| Raspberry Pi OS | Yes | Use start-pi-onboard.sh |
| macOS 12+ | Yes | Use start-macos.sh |
| Debian 11+ | Yes | Use start-linux.sh |

---

## Quick Start

### Windows
1. Install [Node.js](https://nodejs.org/) (v18 or later, LTS version)
2. Download/clone the M.O.U.S.E folder
3. Double-click `start-windows.bat`
4. Browser opens automatically to `http://localhost:5000`
5. Login with default credentials (see User Management)

### Linux
```bash
# Make script executable (first time only)
chmod +x start-linux.sh

# Start the application
./start-linux.sh
```

### Cloud Command and Telemetry Control APIs
- `POST /api/cloud/commands/dispatch`: queue remote drone commands via cloud pipeline
- `POST /api/cloud/commands/:id/ack`: acknowledge/update command execution status from drone/operator path
- `GET /api/cloud/commands`: query command history/queue state by drone and status
- `POST /api/cloud/telemetry/ingest`: ingest operational telemetry for a drone into centralized cloud stream
- `GET /api/cloud/telemetry/live`: retrieve latest + recent telemetry across one or many drones

### Cloud/Debug APIs (Operational Reliability)
- `GET /api/cloud/config`
- `POST /api/cloud/config`
- `GET /api/cloud/status`
- `POST /api/cloud/test`
- `POST /api/cloud/sync-all`
- `GET /api/debug/system`
- `POST /api/debug/system/probe`
- `GET /api/debug/events`
- `POST /api/debug/events/clear`

### macOS
```bash
# Make script executable (first time only)
chmod +x start-macos.sh

# Start the application
./start-macos.sh
```

### Raspberry Pi (Onboard Mode)
```bash
# Run with sudo for serial port access
sudo ./start-pi-onboard.sh
```

### Desktop Application (Electron)

Run M.O.U.S.E as a native desktop application instead of in a browser:

**Linux / macOS:**
```bash
# Make script executable (first time only)
chmod +x start-electron.sh

# Start the desktop application
./start-electron.sh
```

**Windows:**
```batch
start-electron.bat
```

**Features of Desktop Mode:**
- Native window with integrated server
- No browser required
- Automatically shuts down all processes when window is closed
- Data stored in OS-specific application data directory
- Works completely offline

**Build Installers:**
```bash
# Create distributable installers for your platform
./build-electron.sh
```

This creates platform-specific installers in the `electron-dist/` folder:
- **Windows**: `.exe` installer and portable version
- **macOS**: `.dmg` disk image
- **Linux**: `.AppImage` and `.deb` packages

**Troubleshooting Desktop App:**

If port 5000 is already in use (common on macOS with AirPlay):
```bash
# Use a different port
PORT=3000 ./start-electron.sh

# Or kill the process using port 5000
lsof -ti:5000 | xargs kill -9
```

---

## Installation Without Replit

### Option 1: Using Startup Scripts (Recommended)

The included scripts handle everything automatically:

**Windows:**
```batch
start-windows.bat
```

**Linux:**
```bash
./start-linux.sh
```

**macOS:**
```bash
./start-macos.sh
```

**Raspberry Pi:**
```bash
sudo ./start-pi-onboard.sh
```

### Option 2: Manual Installation

```bash
# 1. Clone or download the repository
git clone https://github.com/your-repo/mouse-gcs.git
cd mouse-gcs

# 2. Install dependencies
npm install

# 3. Build the application
npm run build

# 4. Start the server
npm start
```

### Option 3: Creating a Standalone Distribution Package

Use the included build scripts to create a complete, ready-to-distribute package:

**Linux/macOS:**
```bash
# Run the standalone build script
chmod +x scripts/build-standalone.sh
./scripts/build-standalone.sh
```

**Windows (PowerShell):**
```powershell
# Run the PowerShell build script
.\scripts\build-standalone.ps1
```

The build scripts will:
1. Install all dependencies
2. Build the application
3. Create a `standalone/mouse-gcs-1.0.0/` folder with everything needed
4. Generate distribution archives (`.tar.gz` for Linux, `.zip` for Windows)

**Distribution package contents:**
- `index.cjs` - Compiled server application
- `public/` - Frontend web application
- `node_modules/` - Pre-installed dependencies
- `start-windows.bat` - Windows launcher
- `start-linux.sh` - Linux launcher
- `start-macos.sh` - macOS launcher
- `start-pi-onboard.sh` - Raspberry Pi launcher
- `.env.example` - Configuration template
- `INSTALL.txt` - Quick installation guide
- `data/` - Data storage directory (auto-created)

**To deploy the package:**
1. Copy the archive to target machine
2. Extract the archive
3. Install Node.js v18+ if not already installed
4. Run the appropriate start script for your OS

### Option 4: Creating a Single Executable (Advanced)

To create a single portable executable using `pkg`:

**Windows (.exe):**
```bash
npm install -g pkg
npm run build
pkg dist/index.cjs --targets node18-win-x64 --output mouse-gcs.exe
```

**Linux:**
```bash
npm install -g pkg
npm run build
pkg dist/index.cjs --targets node18-linux-x64 --output mouse-gcs
```

**Note:** When distributing single executables, include:
- The executable file
- The `dist/public/` folder (frontend assets)
- The `data/` folder (or it will be created automatically)
- A `.env` file with configuration

### Option 5: Docker Deployment

```dockerfile
# Dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 5000
CMD ["npm", "start"]
```

```bash
docker build -t mouse-gcs .
docker run -p 5000:5000 -v $(pwd)/data:/app/data mouse-gcs
```

---

## Environment Variables & API Keys

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

### Required Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `5000` |
| `NODE_ENV` | Environment mode | `production` |
| `DATA_DIR` | Data storage directory | `./data` |

### Optional Variables

| Variable | Description | Required For |
|----------|-------------|--------------|
| `DEVICE_ROLE` | Set to `ONBOARD` for Raspberry Pi mode | Pi deployment |
| `NO_BROWSER` | Set to `1` to disable auto-open browser | Headless mode |
| `SESSION_SECRET` | Session encryption key (32+ chars) | Security |
| `GOOGLE_AUTH_ENCRYPTION_KEY` | Token encryption key (32+ chars) | Security |

### Firebase Cloud Variables

| Variable | Description |
|----------|-------------|
| `VITE_FIREBASE_API_KEY` | Firebase web API key (client) |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase auth domain |
| `VITE_FIREBASE_DATABASE_URL` | Realtime Database URL |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase Storage bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Cloud Messaging sender ID |
| `VITE_FIREBASE_APP_ID` | Firebase web app ID |
| `VITE_FIREBASE_MEASUREMENT_ID` | Analytics ID (optional) |
| `FIREBASE_PROJECT_ID` | Project ID for Admin SDK |
| `FIREBASE_DATABASE_URL` | RTDB URL for Admin SDK |
| `FIREBASE_STORAGE_BUCKET` | Storage bucket for Admin SDK |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | Absolute path to service account JSON (recommended for local dev) |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Full service account JSON string (alternative) |
| `FIREBASE_SERVICE_ACCOUNT_BASE64` | Base64 service account JSON (alternative) |

### Google Integration Variables

| Variable | Description | How to Obtain |
|----------|-------------|---------------|
| `GOOGLE_CLIENT_ID` | OAuth client ID | Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret | Google Cloud Console |
| `GOOGLE_REDIRECT_URI` | OAuth callback URL | Set to your domain + `/api/google/oauth/callback` |
| `GOOGLE_SHEET_ID` | Spreadsheet ID for data backup | From Google Sheets URL |
| `GOOGLE_DRIVE_FOLDER_ID` | Folder ID for media backup | From Google Drive URL |

### Security Best Practices

**NEVER commit API keys or secrets to version control!**

1. Add `.env` to your `.gitignore`
2. Use environment variables on your server
3. Generate secure random strings for SESSION_SECRET:
   ```bash
   # Linux/macOS
   openssl rand -hex 32
   
   # Windows PowerShell
   -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 32 | % {[char]$_})
   ```

---

## Third-Party Services

### Google Drive API
- **Purpose**: Cloud backup of flight videos and media
- **Setup**: Enable Google Drive API in Cloud Console
- **Cost**: Free tier includes 15GB storage

### Google Sheets API
- **Purpose**: Structured data backup (missions, logs, settings)
- **Setup**: Enable Google Sheets API in Cloud Console
- **Cost**: Free

### TensorFlow.js with COCO-SSD
- **Purpose**: AI-powered object detection (people, vehicles, animals)
- **Setup**: Automatically loaded from CDN
- **Cost**: Free (runs locally in browser)

### Leaflet Maps
- **Purpose**: Interactive map display
- **Setup**: Uses OpenStreetMap tiles (free)
- **Cost**: Free for non-commercial use

### Setting Up Google APIs

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Navigate to APIs & Services > Library
4. Enable:
   - Google Drive API
   - Google Sheets API
5. Go to APIs & Services > Credentials
6. Click "Create Credentials" > "OAuth client ID"
7. Select "Web application"
8. Add authorized redirect URI: `http://localhost:5000/api/google/oauth/callback`
9. Copy Client ID and Client Secret to your `.env` file

---

## Security Features

### Authentication System
- **Password Hashing**: Passwords stored with encryption
- **Session Tokens**: 256-bit cryptographically secure tokens
- **Session Expiry**: Tokens expire after 24 hours
- **Server-Side Sessions**: Session data stored on server, not client

### Role-Based Access Control (RBAC)
| Role | Permissions |
|------|-------------|
| Admin | Full access, user management, system configuration |
| Operator | Flight controls, mission planning, telemetry |
| Viewer | Read-only access to telemetry and maps |
| Custom Roles | Configurable permissions per feature |

### Data Security
- **Local Storage Encryption**: Sensitive data encrypted at rest
- **Google Token Encryption**: OAuth tokens encrypted with AES-256-CBC
- **HTTPS Support**: Enable via reverse proxy for production
- **CORS Protection**: API endpoints protected against cross-origin attacks

### WebSocket Security
- **Token Validation**: WebSocket connections require valid session token
- **User Tracking**: Active users tracked for DM routing
- **Message Privacy**: Direct messages only visible to sender/recipient

---

## User Management

### Default Accounts

| Username | Password | Role | Notes |
|----------|----------|------|-------|
| `admin` | `admin123` | Admin | Change password immediately! |
| `demo` | `demo123` | Viewer | Demo account for testing |

**Important**: Change default passwords after first login!

### Creating Users (Admin Only)

1. Login as admin
2. Click your username in top-right corner
3. Click "User Management"
4. Click "Add User" button
5. Fill in:
   - Username (3+ characters)
   - Full Name (display name)
   - Password (6+ characters)
   - Role (admin/operator/viewer/custom)
6. Click "Create User"

### User Groups

Groups allow messaging multiple users at once:

1. Go to User Management > Groups tab
2. Click "Create Group"
3. Name the group (e.g., "Field Team")
4. Select members
5. Set default role for group
6. Click "Create"

Use `@groupname` in messages to notify all group members.

### Custom Roles

Create additional roles beyond the three built-in ones:

1. Go to User Management > Permissions tab
2. Under "Create Custom Role", enter role name
3. Click "Add Role"
4. Configure permissions for the new role
5. Assign to users as needed

---

## Operating Instructions

### First-Time Setup

1. **Start the Application**
   - Run the appropriate startup script for your OS
   - Wait for "Server running on port 5000" message

2. **Login**
   - Open browser to `http://localhost:5000`
   - Login with admin credentials
   - Change default password in User Management

3. **Configure Base Location**
   - Go to Settings > General
   - Set your home/base coordinates for RTL
   - Save settings

4. **Connect Drone** (if applicable)
   - Configure MAVLink port in Settings > Hardware
   - Select drone from Drone Selection screen
   - Or click "Preview Control Page" for demo mode

### Daily Operations Workflow

1. **Pre-Flight**
   - Power on ground station
   - Start M.O.U.S.E application
   - Login and verify connection status
   - Check battery levels and GPS lock

2. **Mission Planning**
   - Open Mission Planning panel
   - Create new mission or load existing
   - Add waypoints by clicking map or entering coordinates
   - Set waypoint actions (hover, photo, payload, etc.)
   - Save mission

3. **Flight Operations**
   - ARM the system (green ARM button)
   - Click TAKEOFF for automatic takeoff
   - Monitor telemetry panel for flight data
   - Execute mission or manual control
   - Click LAND or RTL when complete

4. **Post-Flight**
   - Review flight logs
   - Sync data to Google (if configured)
   - Power down systems

### Team Communication

- **Broadcast Message**: Type message and press Enter
- **Direct Message**: Type `@username` then your message
- **Group Message**: Type `@groupname` then your message
- **Multi-Recipient**: Type `@user1 @user2` then message

---

## Flight Controls Reference

### Control Deck (Bottom Bar)

| Button | Function | Requirements | Notes |
|--------|----------|--------------|-------|
| **ARM** | Arm motors for flight | None | Green when disarmed, red when armed |
| **DISARM** | Disarm motors | None | Automatically disarms on abort |
| **TAKEOFF** | Automatic takeoff sequence | Armed | Ascends to preset altitude |
| **RTL** | Return to launch/base | Armed + Base location set | Uses configured base coordinates |
| **LAND** | Controlled landing | Armed | Descends at controlled rate |
| **ABORT** | Emergency stop | None | Immediately kills motors! |
| **GRIPPER** | Toggle payload gripper | None | GRAB/RELEASE for payloads |

### Status Indicators

| Indicator | Meaning |
|-----------|---------|
| Green ARM button | System disarmed (safe) |
| Red DISARM button | System armed (motors hot!) |
| Pulsing ABORT | Emergency stop active |
| Amber RTL | Returning to base |

---

## Map Controls Reference

### Map View Controls (Bottom Right)

| Button | Icon | Function | Description |
|--------|------|----------|-------------|
| **Zoom In** | + | Increase zoom level | Zoom in on the map |
| **Zoom Out** | - | Decrease zoom level | Zoom out on the map |
| **Center on Drone** | Crosshair | Center map on drone | Centers the map on the selected drone's GPS position |
| **Center on Operator** | Person | Center map on operator | Centers the map on your current location |
| **Reset View** | Rotate | Reset map view | Resets to drone position or default location |

### Map Layers (Top Right)

| Layer | Description |
|-------|-------------|
| **Dark** | Dark-themed street map (default) |
| **Satellite** | Satellite imagery |
| **Street** | Standard street map |

### Map Features

- **Drone Markers**: All connected drones shown with status indicators
- **Home Position**: Green "H" marker at operator's location
- **Waypoints**: Numbered markers for mission waypoints
- **Flight Path**: Dashed line from operator to waypoints
- **Geofence Zones**: Colored circles/polygons showing restricted areas
- **ADS-B Aircraft**: Aircraft traffic overlay (when enabled)
- **Address Search**: Search bar to find locations by address

### Map Interactions

- **Pan**: Click and drag to move the map
- **Zoom**: Scroll wheel or +/- buttons
- **Click Waypoint**: View waypoint details
- **Click Drone**: View drone status and telemetry
- **Hover Drone**: Quick status tooltip

---

## Settings Configuration

### General Tab
- **Base Location**: Set RTL coordinates (required for Return to Launch)
- **Motor Count**: Configure 4, 6, or 8 motor setup
- **Altitude Units**: Meters or Feet
- **Speed Units**: m/s or mph

### Hardware Tab
- **MAVLink Port**: Serial port for flight controller (`/dev/ttyUSB0`, `COM3`)
- **Baud Rate**: Communication speed (default 115200)
- **LiDAR**: Configure LW20/HA settings
- **GPS**: Here3+ CAN configuration

### Camera Tab
- **RTSP URL**: Stream address for gimbal camera
- **Thermal URL**: Thermal camera stream
- **Webcam**: Enable laptop webcam for testing
- **Recording**: Auto-record settings

### Storage Tab
- **Data Directory**: Where JSON files are stored
- **Google Account**: Sign in/manage cloud backup
- **Auto-Sync**: Enable/disable automatic sync

### Display Tab
- **Theme**: Light/Dark/System
- **Sidebar Tabs**: Show/hide and reorder tabs
- **Telemetry Layout**: Customize panel arrangement

---

## Hardware Configuration

### Supported Hardware

| Component | Model | Connection |
|-----------|-------|------------|
| Flight Controller | Orange Cube+ | USB/UART |
| GPS | Here3+ | CAN bus |
| LiDAR | LW20/HA | Serial/I2C |
| Camera | Skydroid C12 | RTSP/WiFi |
| Motors | Mad Motors XP6S | PWM via FC |

### Connection Diagram

```
┌─────────────────────────────────────────────────┐
│                 Raspberry Pi 5                   │
│                 (Ground Station)                 │
└──────────┬──────────────────────┬───────────────┘
           │                      │
           │ USB/UART             │ WiFi/Ethernet
           │                      │
    ┌──────▼──────┐        ┌──────▼──────┐
    │ Orange Cube+│        │  Skydroid   │
    │     FC      │        │    C12      │
    └──────┬──────┘        └─────────────┘
           │
    ┌──────┴──────┬──────────────┐
    │             │              │
┌───▼───┐   ┌─────▼─────┐  ┌─────▼─────┐
│Here3+ │   │  LW20/HA  │  │  Motors   │
│  GPS  │   │   LiDAR   │  │  (x4-6)   │
└───────┘   └───────────┘  └───────────┘
```

### Serial Port Permissions (Linux)

```bash
# Add user to dialout group
sudo usermod -a -G dialout $USER

# Log out and back in for changes to take effect
```

---

## Project Structure

```
mouse-gcs/
├── client/                    # React frontend
│   └── src/
│       ├── components/        # UI components
│       │   ├── controls/      # Flight control components
│       │   ├── layout/        # Page layout (TopBar, Sidebar)
│       │   ├── map/           # Map components
│       │   ├── panels/        # Feature panels
│       │   ├── telemetry/     # Telemetry displays
│       │   └── ui/            # Reusable UI primitives
│       ├── hooks/             # React hooks
│       ├── lib/               # Utilities
│       └── pages/             # Route pages
├── server/                    # Express backend
│   ├── index.ts               # Entry point
│   ├── routes.ts              # API endpoints
│   ├── storage.ts             # Local JSON storage
│   ├── googleAuth.ts          # OAuth handler
│   ├── googleDrive.ts         # Drive integration
│   └── googleSheets.ts        # Sheets integration
├── shared/                    # Shared types
│   └── schema.ts              # Zod schemas
├── data/                      # JSON data files (auto-created)
├── dist/                      # Build output
├── start-windows.bat          # Windows startup
├── start-linux.sh             # Linux startup
├── start-macos.sh             # macOS startup
├── start-pi-onboard.sh        # Raspberry Pi startup
├── .env.example               # Environment template
└── package.json               # Dependencies
```

---

## Troubleshooting & Common Errors

### Application Won't Start

**Error: `EADDRINUSE: address already in use :::5000`**
```bash
# Another process is using port 5000
# Linux/macOS:
lsof -i :5000
kill -9 <PID>

# Windows:
netstat -ano | findstr :5000
taskkill /PID <PID> /F
```

**Error: `Cannot find module 'xyz'`**
```bash
# Dependencies missing - reinstall
rm -rf node_modules
npm install
```

**Error: `node: command not found`**
- Node.js is not installed
- Download from https://nodejs.org/
- Install v18 LTS or higher

### Build Errors

**Error: `TypeScript compilation failed`**
```bash
# Check TypeScript errors
npm run check

# Common fix: update TypeScript
npm update typescript
```

**Error: `ENOMEM: not enough memory`**
```bash
# Increase Node memory limit
NODE_OPTIONS=--max-old-space-size=4096 npm run build
```

### Connection Issues

**Error: `Cannot connect to flight controller`**
1. Check USB cable connection
2. Verify correct port in Settings > Hardware
3. Check serial port permissions (Linux: `sudo usermod -a -G dialout $USER`)
4. Try different baud rate (115200 is default)

**Error: `WebSocket connection failed`**
1. Check if server is running
2. Verify firewall allows port 5000
3. Check browser console for CORS errors

### Google Integration Issues

**Error: `Google OAuth failed`**
1. Verify GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set
2. Check redirect URI matches exactly
3. Ensure APIs are enabled in Google Cloud Console

**Error: `Token refresh failed`**
1. Re-authenticate in Settings > Storage
2. Check internet connection
3. Verify API quotas not exceeded

### Camera/Video Issues

**Error: `RTSP stream not connecting`**
1. Verify camera is powered on
2. Check network connectivity to camera
3. Verify RTSP URL format: `rtsp://IP:PORT/stream`
4. For Skydroid C12: Connect to camera WiFi first

**Error: `Webcam not detected`**
1. Grant browser camera permissions
2. Check if camera is in use by another app
3. Try different browser

### Map Issues

**Error: `Map tiles not loading`**
1. Check internet connection
2. Try different map layer (Satellite/2D/Hybrid)
3. Clear browser cache

---

## Dependency Issues

### Node.js Version Mismatch

```bash
# Check current version
node -v

# If below v18, update:
# Using nvm (recommended):
nvm install 20
nvm use 20

# Or download from nodejs.org
```

### npm Permission Errors

**Linux/macOS:**
```bash
# Fix npm permissions
sudo chown -R $(whoami) ~/.npm
sudo chown -R $(whoami) /usr/local/lib/node_modules
```

**Windows:**
- Run Command Prompt as Administrator
- Or use Node.js command prompt

### Native Module Build Failures

**Error: `node-gyp rebuild failed`**
```bash
# Install build tools
# Windows:
npm install -g windows-build-tools

# Ubuntu/Debian:
sudo apt install build-essential python3

# macOS:
xcode-select --install
```

### Optional Dependencies

**Warning: `bufferutil/utf-8-validate`**
- These are optional WebSocket optimizations
- Safe to ignore warnings
- Install if needed: `npm install bufferutil utf-8-validate`

### Clearing Cache

```bash
# Clear npm cache
npm cache clean --force

# Remove node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

### Version Conflicts

```bash
# Check for outdated packages
npm outdated

# Update all packages
npm update

# Fix security vulnerabilities
npm audit fix
```

---

## Local Storage Keys

Client-side storage (browser localStorage):

| Key | Purpose |
|-----|---------|
| `mouse_gcs_users` | User accounts |
| `mouse_gcs_session` | Current session |
| `mouse_gcs_session_token` | Server session token |
| `mouse_gcs_groups` | User groups |
| `mouse_gcs_custom_roles` | Custom role definitions |
| `mouse_gcs_role_permissions` | Role permissions |
| `mouse_geofence_zones` | Geofence definitions |
| `mouse_gui_tabs` | Sidebar configuration |
| `mouse_camera_config` | Camera settings |
| `mouse_base_location` | RTL coordinates |
| `mouse_drone_armed` | Current arm state |

---

## API Endpoints Reference

### Authentication
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/login` | POST | User login |
| `/api/auth/logout` | POST | User logout |
| `/api/auth/session` | GET | Get current session |

### Missions
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/missions` | GET | List all missions |
| `/api/missions` | POST | Create mission |
| `/api/missions/:id` | PUT | Update mission |
| `/api/missions/:id` | DELETE | Delete mission |

### Settings
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/settings` | GET | Get all settings |
| `/api/settings` | POST | Create setting |
| `/api/settings/:key` | PUT | Update setting |

### Google Integration
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/google/status` | GET | Check connection status |
| `/api/google/auth-url` | GET | Get OAuth URL |
| `/api/google/oauth/callback` | GET | OAuth callback |

---

## Firebase Cloud Sync

The app now supports centralized Firebase synchronization for cross-operator visibility.

### Synced Operational Data
- missions and waypoints
- drone state and live locations
- telemetry, flight logs, motor telemetry, sensor data
- media metadata (photo/video/3D capture records)
- flight sessions
- team messages (with DM visibility rules)
- operator actions (admin-focused audit stream)

### Media Upload and Offline Failover
- Media upload first attempts Firebase Storage.
- If cloud is unavailable, media is staged locally in `data/media_staging`.
- Metadata is marked `syncStatus: pending` and queued in `offline_backlog`.
- Automatic retry runs in the backend every 60 seconds.
- Manual retry endpoint: `POST /api/cloud/media/sync-pending`

### Access Rules in App Behavior
- Awareness data requires authentication via `x-session-token`.
- Admin dashboard data requires admin role.
- Direct messages are filtered by sender/recipient for non-admin users.

---

## Web Deployment (Firebase App Hosting)

### Prerequisites
1. Firebase project configured (this project uses `mouse-ee60c`).
2. Firebase CLI login:
   ```bash
   npm install -g firebase-tools
   firebase login
   firebase use --add
   ```
3. App Hosting backend created in Firebase project (`mouse-ee60c`).

### Deploy Web App
```bash
npm run deploy:apphosting
```

This command:
1. builds the frontend (`npm run build`)
2. deploys to Firebase App Hosting

### Required Backend Env on App Hosting
- `FIREBASE_PROJECT_ID`
- `FIREBASE_DATABASE_URL`
- `FIREBASE_STORAGE_BUCKET`
- one service account method:
  - `FIREBASE_SERVICE_ACCOUNT_PATH` or
  - `FIREBASE_SERVICE_ACCOUNT_JSON` or
  - `FIREBASE_SERVICE_ACCOUNT_BASE64`

For full setup details, also see:
- `FIREBASE_SETUP.md`
- `WEB_DEPLOY.md`

---

## Redeploy Web App (Latest)

Use this command from the project root to deploy the latest web app build to Firebase App Hosting:

```bash
npm run deploy:apphosting
```

Equivalent command:

```bash
npm run deploy:web
```

Both commands build first and deploy backend `web-mouse` using:

```bash
firebase apphosting:rollouts:create web-mouse --git-branch main --force
```

If your backend ID is different:

```bash
FIREBASE_APPHOSTING_BACKEND=<your-backend-id> npm run deploy:apphosting:custom
```

Important: Firebase App Hosting deploys from your connected GitHub repository state.
If new features/components are missing on the hosted site, commit and push first:

```bash
git add -A
git commit -m "Deploy latest MOUSE updates"
git push origin main
npm run deploy:apphosting
```

---

## New Cloud/Audio APIs

### Cloud Status and Awareness
- `GET /api/cloud/status`
- `GET /api/cloud/awareness` (authenticated)
- `GET /api/cloud/admin-dashboard` (admin)

### Cloud Media
- `POST /api/cloud/media/upload`
- `POST /api/cloud/media/sync-pending`

### Web Operator Audio Sessions
- `GET /api/audio/session`
- `POST /api/audio/session/join`
- `POST /api/audio/session/leave`

These work with existing audio endpoints:
- `/api/audio/live/start`, `/api/audio/live/stop`
- `/api/audio/drone-mic`
- `/api/audio/tts`

---

## Version History

- **v1.0** - Initial release with core GCS functionality
- **v1.1** - Added geofencing and GUI configuration
- **v1.2** - Camera integration and RTSP support
- **v1.3** - GPS-denied navigation and multi-sensor verification
- **v1.4** - Mission execution and comprehensive terminal commands
- **v1.5** - Team communication with direct messaging
- **v1.6** - Standalone deployment support and custom roles
- **v1.7** - Firebase cloud sync, offline media failover, web deployment to Firebase App Hosting, operator audio bridge session APIs

---

## Support

For issues and feature requests, please check:
1. This README's Troubleshooting section
2. The project's issue tracker
3. Community forums

---

## License

Proprietary - M.O.U.S.E Ground Control Station

Multi-purpose Operational Unmanned Aerial System for Emergency Response & Environmental Monitoring
