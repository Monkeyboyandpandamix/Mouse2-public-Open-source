# M.O.U.S.E Ground Control Station

**M**ission **O**ptimized **U**nmanned **S**ystem **E**nvironment

A comprehensive ground control station for autonomous drone control with Orange Cube+ flight controllers running on Raspberry Pi 5.

---

## Table of Contents

1. [Overview](#overview)
2. [Hardware Requirements](#hardware-requirements)
3. [Installation Without Replit](#installation-without-replit)
4. [Hardware Input Configuration](#hardware-input-configuration)
5. [Project Structure](#project-structure)
6. [File Reference Guide](#file-reference-guide)
7. [Frontend Components](#frontend-components)
8. [Backend Services](#backend-services)
9. [Database Schema](#database-schema)
10. [Terminal Commands Reference](#terminal-commands-reference)
11. [Configuration Files](#configuration-files)
12. [Troubleshooting](#troubleshooting)

---

## Overview

M.O.U.S.E is designed for:
- Real-time telemetry monitoring and display
- Mission planning with waypoint management
- Object tracking with motion detection
- Geofencing with breach actions
- Two-way audio communication
- ADS-B aircraft traffic awareness
- GPS-denied navigation support (visual odometry, dead reckoning, compass navigation)
- Multi-sensor verification (dual GPS, multiple compasses, barometers)
- Camera-based and LiDAR obstacle detection with automatic rerouting
- Custom automation scripts

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

## Installation Without Replit

### Prerequisites

Before installing, ensure you have the following on your system:

1. **Node.js** (v18 or higher) - [Download](https://nodejs.org/)
2. **PostgreSQL** (v14 or higher) - [Download](https://www.postgresql.org/download/)
3. **Git** - [Download](https://git-scm.com/)

### Step 1: Clone the Repository

```bash
git clone https://github.com/your-repo/mouse-gcs.git
cd mouse-gcs
```

### Step 2: Install Dependencies

```bash
npm install
```

### Step 3: Set Up PostgreSQL Database

1. Start PostgreSQL service:
   ```bash
   # Linux
   sudo systemctl start postgresql
   
   # macOS (Homebrew)
   brew services start postgresql
   
   # Windows - Start from Services panel
   ```

2. Create a database:
   ```bash
   sudo -u postgres psql
   CREATE DATABASE mouse_gcs;
   CREATE USER mouse_user WITH PASSWORD 'your_password';
   GRANT ALL PRIVILEGES ON DATABASE mouse_gcs TO mouse_user;
   \q
   ```

### Step 4: Configure Environment Variables

Create a `.env` file in the project root:

```bash
# Database connection
DATABASE_URL=postgresql://mouse_user:your_password@localhost:5432/mouse_gcs

# Server configuration
PORT=5000
NODE_ENV=development

# Optional: Google API keys for Sheets/Drive backup
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
```

### Step 5: Initialize the Database

```bash
npm run db:push
```

### Step 6: Run the Application

**Development mode** (with hot reload):
```bash
npm run dev
```

**Production mode**:
```bash
npm run build
npm start
```

The application will be available at `http://localhost:5000`

### Running on Raspberry Pi

For deployment on Raspberry Pi 5:

1. Install Node.js on Pi:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```

2. Install PostgreSQL:
   ```bash
   sudo apt install postgresql postgresql-contrib
   ```

3. Clone and set up as above, then create a systemd service:
   ```bash
   sudo nano /etc/systemd/system/mouse-gcs.service
   ```

   Add:
   ```ini
   [Unit]
   Description=M.O.U.S.E Ground Control Station
   After=network.target postgresql.service

   [Service]
   Type=simple
   User=pi
   WorkingDirectory=/home/pi/mouse-gcs
   ExecStart=/usr/bin/npm start
   Restart=on-failure
   Environment=NODE_ENV=production
   Environment=DATABASE_URL=postgresql://mouse_user:password@localhost:5432/mouse_gcs

   [Install]
   WantedBy=multi-user.target
   ```

4. Enable and start:
   ```bash
   sudo systemctl enable mouse-gcs
   sudo systemctl start mouse-gcs
   ```

---

## Hardware Input Configuration

The Terminal Commands panel contains all commands for configuring hardware inputs. Each command uses specific device addresses that you need to update based on your hardware setup.

### Serial Port Configuration

Hardware devices connect via serial ports. Common port paths:

| Device | Linux Path | Description |
|--------|------------|-------------|
| Orange Cube+ | `/dev/ttyUSB0` or `/dev/ttyACM0` | Main flight controller |
| Here3+ GPS | CAN bus via Cube | Connected through CAN port |
| LW20/HA LiDAR | `/dev/ttyUSB1` or I2C | Serial or I2C connection |
| Skydroid C12 | RTSP stream | Network stream |

### Configuring Device Addresses

#### 1. Flight Controller (MAVLink)

Edit the connection in **Settings > Hardware Configuration**:

```
Connection Type: Serial
Port: /dev/ttyUSB0
Baud Rate: 115200
Protocol: MAVLink 2.0
```

Or use terminal commands:
```bash
mavlink_shell 'param set SERIAL1_BAUD 115200'
mavlink_shell 'param set SERIAL1_PROTOCOL 2'
```

#### 2. LiDAR Configuration

**Serial Connection** (default):
```bash
# Set serial port
mavlink_shell 'param set RNGFND1_TYPE 8'        # LW20 type
mavlink_shell 'param set SERIAL4_PROTOCOL 9'    # Rangefinder protocol
mavlink_shell 'param set SERIAL4_BAUD 115200'   # Baud rate
```

**I2C Connection**:
```bash
# Use I2C address 0x66 (default for LW20)
mavlink_shell 'param set RNGFND1_TYPE 7'        # I2C type
mavlink_shell 'param set RNGFND1_ADDR 0x66'     # I2C address
```

**Mounting Direction**:
```bash
# Forward facing (for obstacle avoidance)
mavlink_shell 'param set RNGFND1_ORIENT 0'

# Downward facing (for altitude)
mavlink_shell 'param set RNGFND1_ORIENT 25'
```

#### 3. GPS Configuration (Here3+ CAN)

The Here3+ connects via CAN bus. Configure in terminal:
```bash
mavlink_shell 'param set CAN_P1_DRIVER 1'
mavlink_shell 'param set GPS_TYPE 9'            # UAVCAN
mavlink_shell 'param set GPS_TYPE2 9'           # Secondary GPS
```

#### 4. Camera/Video Stream

Configure in **Settings > Camera Configuration** or via RTSP:

| Camera Type | Address Format |
|-------------|----------------|
| Skydroid C12 Main | `rtsp://192.168.1.1:8554/main` |
| Skydroid C12 Thermal | `rtsp://192.168.1.1:8554/thermal` |
| USB Webcam | Device index (0, 1, 2...) |
| Network IP Cam | `rtsp://user:pass@ip:port/stream` |

#### 5. ADS-B Receiver

```bash
mavlink_shell 'param set ADSB_TYPE 1'           # MAVLink
mavlink_shell 'param set ADSB_LIST_MAX 25'      # Max tracked aircraft
```

### Common Terminal Address Parameters

Many terminal commands accept device addresses as parameters. Examples:

```bash
# Specify camera device
python3 /opt/mouse/vision/obstacle_detect.py --camera /dev/video0

# Specify serial port for telemetry
python3 /opt/mouse/telemetry/stream.py --port /dev/ttyUSB0 --baud 115200

# Specify I2C bus for sensors
python3 /opt/mouse/sensors/read_baro.py --bus 1 --address 0x77
```

### Environment Variables for Hardware

Set these in your `.env` file or system environment:

```bash
# MAVLink connection
MAVLINK_PORT=/dev/ttyUSB0
MAVLINK_BAUD=115200

# Camera stream
CAMERA_RTSP_URL=rtsp://192.168.1.1:8554/main
CAMERA_THERMAL_URL=rtsp://192.168.1.1:8554/thermal

# LiDAR
LIDAR_PORT=/dev/ttyUSB1
LIDAR_I2C_BUS=1
LIDAR_I2C_ADDR=0x66

# GPS
GPS_CAN_INTERFACE=can0
```

---

## Project Structure

```
mouse-gcs/
├── client/                    # React frontend application
│   └── src/
│       ├── components/        # UI components
│       │   ├── controls/      # Flight control components
│       │   ├── layout/        # Page layout components
│       │   ├── map/           # Map and mission components
│       │   ├── panels/        # Feature panels (settings, logs, etc.)
│       │   ├── telemetry/     # Telemetry display components
│       │   ├── ui/            # Reusable UI primitives (shadcn/ui)
│       │   └── video/         # Camera feed components
│       ├── hooks/             # React hooks
│       ├── lib/               # Utility libraries
│       └── pages/             # Route pages
├── server/                    # Express backend
├── shared/                    # Shared types and schema
└── attached_assets/           # Images and documentation
```

---

## File Reference Guide

### Root Configuration Files

| File | Purpose | When to Modify |
|------|---------|----------------|
| `package.json` | Dependencies and npm scripts | Adding new packages |
| `vite.config.ts` | Vite build configuration, plugins, aliases | Changing build behavior |
| `tsconfig.json` | TypeScript compiler settings | TypeScript configuration |
| `drizzle.config.ts` | Database ORM configuration | Database connection changes |
| `postcss.config.js` | PostCSS/Tailwind processing | CSS processing changes |
| `components.json` | shadcn/ui component config | UI library settings |
| `.env` | Environment variables | Secrets, database URL, ports |

### Server Files (`server/`)

| File | Purpose | Key Functions |
|------|---------|---------------|
| `index.ts` | **Main entry point** - Creates Express server, initializes WebSocket for real-time telemetry, starts listening on port 5000 | `createServer()`, WebSocket handlers |
| `routes.ts` | **API route definitions** - All REST endpoints for CRUD operations on missions, waypoints, settings, users, flight logs | `registerRoutes()` |
| `storage.ts` | **Database layer** - All Drizzle ORM queries, implements IStorage interface for data persistence | `getSettings()`, `createMission()`, `getWaypoints()` |
| `googleSheets.ts` | **Google Sheets integration** - Backup/sync mission data to Google Sheets | `syncToSheets()`, `importFromSheets()` |
| `googleDrive.ts` | **Google Drive integration** - Upload/download flight videos and logs | `uploadVideo()`, `listFiles()` |
| `static.ts` | **Static file serving** - Serves built frontend assets in production | `serveStatic()` |
| `vite.ts` | **Dev server proxy** - Proxies requests to Vite dev server during development | `setupVite()` |

### Shared Files (`shared/`)

| File | Purpose | Contents |
|------|---------|----------|
| `schema.ts` | **Database schema** - Drizzle table definitions, Zod validation schemas, TypeScript types | All table definitions, insert/select types |

### Client Application (`client/src/`)

| File | Purpose |
|------|---------|
| `main.tsx` | React app entry point, renders App component |
| `App.tsx` | Main app component with routing (wouter) |
| `index.css` | Global CSS styles, Tailwind imports |

### Client Pages (`client/src/pages/`)

| File | Purpose |
|------|---------|
| `home.tsx` | Main dashboard page - Contains all panels, map, telemetry, controls. Handles session authentication state |
| `not-found.tsx` | 404 error page |

### Client Libraries (`client/src/lib/`)

| File | Purpose |
|------|---------|
| `api.ts` | API client functions for backend communication |
| `queryClient.ts` | TanStack Query client configuration |
| `operationsLog.ts` | Operations console logging utilities |
| `utils.ts` | Utility functions (cn for classnames, etc.) |

### Client Hooks (`client/src/hooks/`)

| File | Purpose |
|------|---------|
| `use-mobile.tsx` | Detects mobile viewport for responsive design |
| `use-toast.ts` | Toast notification hook |

---

## Frontend Components

### Layout Components (`client/src/components/layout/`)

| File | Purpose | Key Features |
|------|---------|--------------|
| `TopBar.tsx` | Main navigation bar | System status, diagnostics, connection indicators, user menu, theme toggle |
| `Sidebar.tsx` | Vertical navigation tabs | Switches between panels (Map, Mission, Tracking, etc.), collapsible |

### Control Components (`client/src/components/controls/`)

| File | Purpose | Key Features |
|------|---------|--------------|
| `ControlDeck.tsx` | Bottom flight control bar | ARM/DISARM toggle, Takeoff/Land buttons, RTL, Abort (emergency stop), Gripper open/close. Dispatches flight-command events |

### Map Components (`client/src/components/map/`)

| File | Purpose | Key Features |
|------|---------|--------------|
| `MapInterface.tsx` | Main Leaflet map | Drone position marker, waypoint display, flight path polyline, address search, layer switching (Satellite/2D/Hybrid), geofence visualization |
| `MissionMap.tsx` | Mission planning map | Click-to-add waypoints, waypoint markers with order numbers, home position, route lines |

### Panel Components (`client/src/components/panels/`)

| File | Purpose | Key Features |
|------|---------|--------------|
| `SettingsPanel.tsx` | System configuration | Connection settings (MAVLink port/baud), sensor config, camera presets (Skydroid C12, LW20 LiDAR, Here3+ GPS), hardware ports, base RTL location, Google Sheets/Drive integration, motor count |
| `MissionPlanningPanel.tsx` | Mission waypoint management | Create/select missions, add waypoints via map click/address/coordinates, set waypoint actions (flythrough, hover, alert, patrol, RTL), edit/delete waypoints, execute missions |
| `TrackingPanel.tsx` | Object tracking | Motion-based detection, IoU (Intersection over Union) tracking for stable object IDs, target lock/follow, bounding box display |
| `SpeakerPanel.tsx` | Audio broadcast | Text-to-speech, audio file playback, volume control, supports Pi GPIO speaker, USB speaker, Orange Cube+ buzzer |
| `FlightLogsPanel.tsx` | Flight history | View past flights with duration/distance/altitude, export logs as JSON/CSV, delete with confirmation dialog, filter by date |
| `AutomationPanel.tsx` | Custom automation scripts | Create trigger-based scripts, triggers: takeoff, landing, waypoint reached, battery low, GPS lost, disconnect. Actions: execute commands, change modes, send alerts |
| `TerminalCommandsPanel.tsx` | Command reference and execution | 80+ commands organized by category (arming, flight, navigation, telemetry, camera, video, system, payload). Camera obstacle detection, LiDAR config, sensor fusion, GPS-denied navigation, multi-sensor verification commands |
| `UserAccessPanel.tsx` | User management | Login/logout, role-based access (admin, operator, viewer), user creation/editing, session management, displays full name |
| `GeofencingPanel.tsx` | Flight boundaries | Create circular/polygon zones, enter by address or coordinates, set breach actions (RTL, land, hover, warn), configure altitude limits per zone |
| `GUIConfigPanel.tsx` | Interface customization | Show/hide sidebar tabs, reorder tabs, panel positions, enable/disable panel dragging, theme selection (light/dark/system) |

### Telemetry Components (`client/src/components/telemetry/`)

| File | Purpose | Key Features |
|------|---------|--------------|
| `TelemetryPanel.tsx` | Main telemetry display | Altitude, ground speed, vertical speed, battery voltage/percentage, GPS coordinates, satellite count, distance to home, motor RPM/temp for all motors (4-6), flight mode indicator. Responds to flight-command events with simulated telemetry |
| `AttitudeIndicator.tsx` | Artificial horizon | SVG-based pitch and roll visualization, sky/ground gradient, pitch ladder |
| `GyroscopeIndicator.tsx` | Gyroscope visualization | Shows angular velocity on X/Y/Z axes |

### Video Components (`client/src/components/video/`)

| File | Purpose | Key Features |
|------|---------|--------------|
| `VideoFeed.tsx` | Camera feed display | Mode switching (gimbal/thermal/FPV/webcam), zoom controls, recording toggle, RTSP stream support, snapshot capture, thermal color palettes |

### UI Components (`client/src/components/ui/`)

Reusable shadcn/ui primitives: Button, Card, Dialog, Input, Select, Tabs, Toast, Accordion, Badge, Checkbox, Dropdown, Popover, Progress, ScrollArea, Separator, Slider, Switch, Table, Textarea, Tooltip, etc.

---

## Backend Services

### API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/settings` | GET | Get all settings |
| `/api/settings` | POST | Create new setting |
| `/api/settings/:key` | GET | Get specific setting |
| `/api/settings/:key` | PUT | Update setting |
| `/api/settings/:key` | DELETE | Delete setting |
| `/api/missions` | GET | List all missions |
| `/api/missions` | POST | Create new mission |
| `/api/missions/:id` | GET | Get mission details |
| `/api/missions/:id` | PUT | Update mission |
| `/api/missions/:id` | DELETE | Delete mission |
| `/api/missions/:id/waypoints` | GET | Get waypoints for mission |
| `/api/waypoints` | POST | Create waypoint |
| `/api/waypoints/:id` | PATCH | Update waypoint |
| `/api/waypoints/:id` | DELETE | Delete waypoint |
| `/api/flight-logs` | GET | List flight logs |
| `/api/flight-logs` | POST | Create flight log |
| `/api/flight-logs/:id` | DELETE | Delete flight log |
| `/api/users` | GET | List users |
| `/api/users` | POST | Create user |
| `/api/users/:id` | PUT | Update user |
| `/api/auth/login` | POST | User login |
| `/api/auth/logout` | POST | User logout |
| `/api/auth/session` | GET | Get current session |

### WebSocket Events

| Event | Direction | Purpose |
|-------|-----------|---------|
| `telemetry` | Server → Client | Real-time telemetry data stream |
| `mission-execute` | Client → Server | Start mission execution |
| `flight-command` | Client → Server | Flight control commands |

---

## Database Schema

Located in `shared/schema.ts`:

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `settings` | Key-value configuration | key, value, category |
| `missions` | Mission definitions | name, status, homeLatitude, homeLongitude, homeAltitude |
| `waypoints` | Waypoint data | missionId, order, latitude, longitude, altitude, speed, action, actionParams, address |
| `flightLogs` | Flight history | startTime, endTime, duration, distance, maxAltitude, flightPath |
| `users` | User accounts | username, password, fullName, role, isActive |
| `sensorData` | Sensor readings | timestamp, sensorType, value, unit |
| `motorTelemetry` | Motor data | motorId, rpm, temperature, current |
| `cameraSettings` | Camera config | name, streamUrl, resolution, frameRate |

---

## Terminal Commands Reference

The Terminal Commands panel includes 80+ commands organized by category:

### Navigation Commands

| Command | Purpose | Parameters |
|---------|---------|------------|
| Enable Camera Obstacle Detection | Activates visual obstacle detection | camera_id (main/thermal), confidence (0.1-1.0) |
| Configure Obstacle Rerouting | Sets auto-reroute behavior | mode (left/right/up/auto), distance |
| Enable LiDAR Navigation | Activates LW20/HA LiDAR | - |
| Configure LiDAR Mount | Sets mounting direction | orient (0=fwd, 25=down), x/y/z offsets |
| Enable Sensor Fusion | Activates all sensor fusion | - |
| Verify Position (Multi-Sensor) | Cross-checks position with GPS/compass/visual | - |
| Verify Altitude (Multi-Sensor) | Cross-references altitude sources | tolerance (meters) |
| Enable GPS-Denied Navigation | Activates visual odometry/dead reckoning | mode (visual/deadreck/fusion) |
| Enable Visual Odometry | Uses camera for position estimation | - |
| Enable Dead Reckoning | Compass + speed based navigation | - |
| Use Flight Path History | Enables return via recorded path | - |

### Flight Commands

| Command | Purpose |
|---------|---------|
| Arm System | Arms motors for flight |
| Disarm System | Disarms motors |
| Takeoff | Initiates automatic takeoff |
| Land | Controlled landing |
| Return to Launch | Returns to home and lands |
| Emergency Stop | Immediately kills motors |

### System Commands

| Command | Purpose |
|---------|---------|
| Reboot Flight Controller | Restarts Orange Cube+ |
| Save to EEPROM | Persists parameter changes |
| Calibrate Accelerometer | Runs accel calibration |
| Calibrate Compass | Runs magnetometer calibration |
| Calibrate Barometers | Recalibrates pressure sensors |

---

## Configuration Files

| File | Purpose |
|------|---------|
| `vite.config.ts` | Vite build configuration with plugins |
| `tsconfig.json` | TypeScript compiler settings |
| `drizzle.config.ts` | Drizzle ORM database configuration |
| `postcss.config.js` | PostCSS processing for Tailwind |
| `components.json` | shadcn/ui component configuration |
| `package.json` | Dependencies and scripts |

---

## Troubleshooting

### Connection Issues

1. Verify `DATABASE_URL` is set correctly
2. Check flight controller is connected via USB/UART
3. Ensure WebSocket port is not blocked
4. Verify serial port permissions: `sudo usermod -a -G dialout $USER`

### Camera Feed

1. For laptop webcam: Grant browser camera permissions
2. For RTSP streams: Verify network connectivity to camera
3. For Skydroid C12: Connect to camera WiFi network first

### GPS/Sensors

1. Verify CAN bus connections for Here3+
2. Check I2C address for LW20/HA LiDAR (default 0x66)
3. Run sensor calibration commands if readings are erratic
4. Check `dmesg` for USB device detection

### Database Issues

1. Ensure PostgreSQL is running: `sudo systemctl status postgresql`
2. Check database exists: `psql -l`
3. Run migrations: `npm run db:push`

---

## Local Storage Keys

The application uses localStorage for client-side persistence:

| Key | Purpose |
|-----|---------|
| `mouse_geofence_zones` | Geofence zone definitions |
| `mouse_gui_tabs` | Sidebar tab configuration |
| `mouse_gui_panels` | Panel position/visibility settings |
| `mouse_camera_config` | Camera stream settings |
| `mouse_theme` | UI theme preference |
| `mouse_base_location` | RTL base coordinates |
| `mouse_automation_scripts` | Custom automation scripts |
| `mouse_terminal_commands` | User-added terminal commands |
| `mouse_drone_armed` | Current arm state |

---

## Version History

- **v1.0** - Initial release with core GCS functionality
- **v1.1** - Added geofencing, GUI configuration, expanded terminal commands
- **v1.2** - Camera integration, RTSP support, improved HUD overlays
- **v1.3** - GPS-denied navigation, multi-sensor verification, obstacle detection commands
- **v1.4** - Mission execution, waypoint editing, comprehensive terminal commands

---

## License

Proprietary - M.O.U.S.E Ground Control Station
