# M.O.U.S.E Ground Control Station

**M**ulti-purpose **O**perational **U**nmanned **A**erial **S**ystem for **E**mergency Response & Environmental Monitoring

A comprehensive ground control station for autonomous drone control with Orange Cube+ flight controllers running on Raspberry Pi 5.

---

## Table of Contents

1. [Overview](#overview)
2. [Key Features](#key-features)
3. [System Requirements](#system-requirements)
4. [Quick Start](#quick-start)
5. [Installation Without Replit](#installation-without-replit)
6. [Environment Variables & API Keys](#environment-variables--api-keys)
7. [Third-Party Services](#third-party-services)
8. [Security Features](#security-features)
9. [User Management](#user-management)
10. [Operating Instructions](#operating-instructions)
11. [Flight Controls Reference](#flight-controls-reference)
12. [Settings Configuration](#settings-configuration)
13. [Hardware Configuration](#hardware-configuration)
14. [Project Structure](#project-structure)
15. [Troubleshooting & Common Errors](#troubleshooting--common-errors)
16. [Dependency Issues](#dependency-issues)

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
| macOS 12+ | Yes | Use start-linux.sh |
| Debian 11+ | Yes | Use start-linux.sh |

---

## Quick Start

### Windows
1. Install [Node.js](https://nodejs.org/) (v18 or later, LTS version)
2. Download/clone the M.O.U.S.E folder
3. Double-click `start-windows.bat`
4. Browser opens automatically to `http://localhost:5000`
5. Login with default credentials (see User Management)

### Linux / macOS
```bash
# Make script executable (first time only)
chmod +x start-linux.sh

# Start the application
./start-linux.sh
```

### Raspberry Pi (Onboard Mode)
```bash
# Run with sudo for serial port access
sudo ./start-pi-onboard.sh
```

---

## Installation Without Replit

### Option 1: Using Startup Scripts (Recommended)

The included scripts handle everything automatically:

**Windows:**
```batch
start-windows.bat
```

**Linux/macOS:**
```bash
./start-linux.sh
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

### Option 3: Creating a Standalone Executable

To create a portable executable for distribution:

**Windows (.exe):**
```bash
# Install pkg globally
npm install -g pkg

# Build the executable
npm run build
pkg dist/index.cjs --targets node18-win-x64 --output mouse-gcs.exe

# The executable can be distributed with the 'dist/public' folder
```

**Linux:**
```bash
npm install -g pkg
npm run build
pkg dist/index.cjs --targets node18-linux-x64 --output mouse-gcs
```

**Note:** When distributing executables, include:
- The executable file
- The `dist/public/` folder (frontend assets)
- The `data/` folder (or it will be created automatically)
- A `.env` file with configuration

### Option 4: Docker Deployment

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
├── start-linux.sh             # Linux/macOS startup
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

## Version History

- **v1.0** - Initial release with core GCS functionality
- **v1.1** - Added geofencing and GUI configuration
- **v1.2** - Camera integration and RTSP support
- **v1.3** - GPS-denied navigation and multi-sensor verification
- **v1.4** - Mission execution and comprehensive terminal commands
- **v1.5** - Team communication with direct messaging
- **v1.6** - Standalone deployment support and custom roles

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
