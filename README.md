# M.O.U.S.E Ground Control Station

**M**ission **O**ptimized **U**nmanned **S**ystem **E**nvironment

A comprehensive ground control station for autonomous drone control with Orange Cube+ flight controllers running on Raspberry Pi 5.

---

## Table of Contents

1. [Overview](#overview)
2. [Key Features](#key-features)
3. [Quick Start](#quick-start)
4. [Standalone Deployment](#standalone-deployment)
5. [Hardware Requirements](#hardware-requirements)
6. [Hardware Input Configuration](#hardware-input-configuration)
7. [Project Structure](#project-structure)
8. [Environment Variables](#environment-variables)
9. [Google Integration Setup](#google-integration-setup)
10. [Running as a Service](#running-as-a-service)
11. [Troubleshooting](#troubleshooting)

---

## Overview

M.O.U.S.E is designed for:
- Real-time telemetry monitoring and display
- Mission planning with waypoint management
- Object tracking with AI-powered motion detection (TensorFlow.js COCO-SSD)
- Geofencing with breach actions
- Two-way audio communication
- ADS-B aircraft traffic awareness
- GPS-denied navigation support (visual odometry, dead reckoning, compass navigation)
- Multi-sensor verification (dual GPS, multiple compasses, barometers)
- Camera-based and LiDAR obstacle detection with automatic rerouting
- Custom automation scripts
- Multi-drone management from a single ground station
- Team communication with direct messaging

**Storage**: This application uses **offline-first local JSON storage** (no database required). Data is stored in the `./data` directory and can optionally sync to Google Drive/Sheets when online.

---

## Key Features

- **Offline-First**: Works without internet connection, syncs when online
- **No Database Required**: All data stored in local JSON files
- **Dual Deployment Modes**: Ground control (desktop/laptop) or Onboard (Raspberry Pi)
- **Multi-Drone Support**: Connect and manage multiple drones simultaneously
- **AI Object Tracking**: TensorFlow.js COCO-SSD model for detecting people, vehicles, etc.
- **Team Communication**: Real-time messaging with DM support
- **Role-Based Access**: Admin, operator, viewer + custom roles
- **Google Backup**: Optional sync to Google Drive/Sheets

---

## Quick Start

### Windows
1. Download and install [Node.js](https://nodejs.org/) (v18 or later, LTS recommended)
2. Double-click `start-windows.bat`
3. The app will open in your browser at `http://localhost:5000`

### Linux / macOS
1. Install Node.js (v18 or later)
2. Run: `chmod +x start-linux.sh && ./start-linux.sh`
3. The app will open in your browser at `http://localhost:5000`

### Raspberry Pi (Onboard Mode)
1. Install Node.js: `sudo apt install nodejs npm`
2. Run: `sudo ./start-pi-onboard.sh`
3. Access from another device at `http://<pi-ip>:5000`

---

## Standalone Deployment

This application is fully portable and can be deployed anywhere without Replit.

### Prerequisites

- **Node.js** v18 or higher - [Download](https://nodejs.org/)
- **Git** (optional, for cloning) - [Download](https://git-scm.com/)

**No database required** - the app uses local JSON files for storage.

### Step 1: Get the Code

```bash
# Clone or download the repository
git clone https://github.com/your-repo/mouse-gcs.git
cd mouse-gcs

# Or download as ZIP and extract
```

### Step 2: Configure Environment (Optional)

Copy the example environment file:
```bash
cp .env.example .env
```

Edit `.env` to customize settings (see [Environment Variables](#environment-variables)).

### Step 3: Run the Application

**Option A: Use the startup scripts (recommended)**

```bash
# Windows
start-windows.bat

# Linux / macOS
./start-linux.sh

# Raspberry Pi (onboard mode)
sudo ./start-pi-onboard.sh
```

**Option B: Manual commands**

```bash
# Install dependencies
npm install

# Build for production
npm run build

# Start the server
npm start
```

**Option C: Development mode**

```bash
npm install
npm run dev
```

### Step 4: Access the Application

Open your browser to `http://localhost:5000`

Default credentials:
- **Admin**: username `admin`, password `admin123`
- **Demo**: username `demo`, password `demo123`

---

## Hardware Requirements

| Component | Model | Purpose |
|-----------|-------|---------|
| Companion Computer | Raspberry Pi 5 (16GB) | Runs ground control software |
| Flight Controller | Orange Cube+ with ADSB Carrier Board | Flight management |
| GPS | Here3+ GPS Module (CAN) | Position, RTK, compass |
| LiDAR | LW20/HA | Altitude/obstacle detection |
| Camera/Gimbal | Skydroid C12 | 2K HD + 384x288 Thermal |
| Propulsion | Mad Motors XP6S Arms (x4-6) | Variable motor configuration |

---

## Hardware Input Configuration

### Serial Port Configuration

| Device | Linux Path | Description |
|--------|------------|-------------|
| Orange Cube+ | `/dev/ttyUSB0` or `/dev/ttyACM0` | Main flight controller |
| Here3+ GPS | CAN bus via Cube | Connected through CAN port |
| LW20/HA LiDAR | `/dev/ttyUSB1` or I2C | Serial or I2C connection |
| Skydroid C12 | RTSP stream | Network stream |

### Camera Stream URLs

| Camera Type | Address Format |
|-------------|----------------|
| Skydroid C12 Main | `rtsp://192.168.1.1:8554/main` |
| Skydroid C12 Thermal | `rtsp://192.168.1.1:8554/thermal` |
| USB Webcam | Device index (0, 1, 2...) |
| Network IP Cam | `rtsp://user:pass@ip:port/stream` |

---

## Project Structure

```
mouse-gcs/
├── client/                    # React frontend application
│   └── src/
│       ├── components/        # UI components
│       ├── hooks/             # React hooks
│       ├── lib/               # Utility libraries
│       └── pages/             # Route pages
├── server/                    # Express backend
│   ├── index.ts               # Main entry point
│   ├── routes.ts              # API endpoints
│   ├── storage.ts             # Local JSON storage
│   ├── googleAuth.ts          # Google OAuth handler
│   ├── googleDrive.ts         # Google Drive integration
│   └── googleSheets.ts        # Google Sheets integration
├── shared/                    # Shared types and schema
│   └── schema.ts              # Zod schemas and types
├── data/                      # Local JSON data storage (auto-created)
│   ├── settings.json
│   ├── missions.json
│   ├── waypoints.json
│   └── ...
├── start-windows.bat          # Windows startup script
├── start-linux.sh             # Linux/macOS startup script
├── start-pi-onboard.sh        # Raspberry Pi onboard mode script
├── .env.example               # Environment variable template
└── package.json               # Dependencies and scripts
```

---

## Environment Variables

Copy `.env.example` to `.env` and customize:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 5000 | Server port |
| `NODE_ENV` | production | Environment mode |
| `DATA_DIR` | ./data | Directory for JSON data files |
| `DEVICE_ROLE` | (empty) | Set to `ONBOARD` for Raspberry Pi mode |
| `NO_BROWSER` | (empty) | Set to `1` to disable auto-opening browser |
| `SESSION_SECRET` | (generated) | Secret for session encryption |
| `GOOGLE_CLIENT_ID` | (empty) | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | (empty) | Google OAuth client secret |
| `GOOGLE_REDIRECT_URI` | localhost | OAuth callback URL |

---

## Google Integration Setup

The Google Drive/Sheets backup is optional. To enable it:

### 1. Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project
3. Enable the Google Drive API and Google Sheets API

### 2. Create OAuth Credentials

1. Go to APIs & Services > Credentials
2. Click "Create Credentials" > "OAuth client ID"
3. Select "Web application"
4. Add authorized redirect URI: `http://localhost:5000/api/google/oauth/callback`
5. Copy the Client ID and Client Secret

### 3. Configure Environment

Add to your `.env` file:
```bash
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:5000/api/google/oauth/callback
```

### 4. Authorize in App

1. Go to Settings > Storage in the app
2. Click "Sign in with Google"
3. Complete the OAuth flow

---

## Running as a Service

### Linux (systemd)

Create `/etc/systemd/system/mouse-gcs.service`:

```ini
[Unit]
Description=M.O.U.S.E Ground Control Station
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/mouse-gcs
ExecStart=/usr/bin/node dist/index.cjs
Restart=on-failure
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=5000
Environment=DATA_DIR=/home/pi/mouse-gcs/data

[Install]
WantedBy=multi-user.target
```

Then enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable mouse-gcs
sudo systemctl start mouse-gcs
```

### Raspberry Pi (Onboard Mode)

Same as above, but add:
```ini
Environment=DEVICE_ROLE=ONBOARD
```

### Windows (Task Scheduler)

1. Open Task Scheduler
2. Create Basic Task
3. Set trigger: "When the computer starts"
4. Action: Start a program
5. Program: `node.exe`
6. Arguments: `dist/index.cjs`
7. Start in: `C:\path\to\mouse-gcs`

---

## Troubleshooting

### Application Won't Start

1. Check Node.js version: `node -v` (must be v18+)
2. Delete `node_modules` and run `npm install` again
3. Check for port conflicts: `lsof -i :5000`

### Build Fails

1. Ensure all dependencies installed: `npm install` (not `npm install --production`)
2. Check TypeScript errors: `npm run check`

### Serial Port Access (Linux/Pi)

Add your user to the dialout group:
```bash
sudo usermod -a -G dialout $USER
# Log out and back in
```

### Camera Feed Not Working

1. For webcam: Grant browser camera permissions
2. For RTSP: Verify network connectivity
3. For Skydroid C12: Connect to camera WiFi first

### Data Not Persisting

1. Check `DATA_DIR` environment variable
2. Ensure write permissions on data directory
3. Check disk space

### Google Sync Not Working

1. Verify OAuth credentials in `.env`
2. Check redirect URI matches exactly
3. Re-authorize in Settings > Storage

---

## Local Storage Keys

Client-side storage (browser localStorage):

| Key | Purpose |
|-----|---------|
| `mouse_gcs_users` | User accounts |
| `mouse_gcs_session` | Current session |
| `mouse_gcs_groups` | User groups |
| `mouse_gcs_custom_roles` | Custom role definitions |
| `mouse_gcs_role_permissions` | Role permissions |
| `mouse_geofence_zones` | Geofence definitions |
| `mouse_gui_tabs` | Sidebar configuration |
| `mouse_camera_config` | Camera settings |
| `mouse_base_location` | RTL coordinates |

---

## Version History

- **v1.0** - Initial release with core GCS functionality
- **v1.1** - Added geofencing, GUI configuration, expanded terminal commands
- **v1.2** - Camera integration, RTSP support, improved HUD overlays
- **v1.3** - GPS-denied navigation, multi-sensor verification, obstacle detection
- **v1.4** - Mission execution, waypoint editing, comprehensive terminal commands
- **v1.5** - Standalone deployment support, local JSON storage, Google backup

---

## License

Proprietary - M.O.U.S.E Ground Control Station
