# M.O.U.S.E Ground Control Station

**M**ission **O**ptimized **U**nmanned **S**ystem **E**nvironment

A comprehensive ground control station for autonomous drone control with Orange Cube+ flight controllers running on Raspberry Pi 5.

---

## Table of Contents

1. [Overview](#overview)
2. [Hardware Requirements](#hardware-requirements)
3. [Project Structure](#project-structure)
4. [Frontend Components](#frontend-components)
5. [Backend Services](#backend-services)
6. [Database Schema](#database-schema)
7. [Configuration Files](#configuration-files)
8. [Running the Application](#running-the-application)
9. [Feature Documentation](#feature-documentation)

---

## Overview

M.O.U.S.E is designed for:
- Real-time telemetry monitoring and display
- Mission planning with waypoint management
- Object tracking with motion detection
- Geofencing with breach actions
- Two-way audio communication
- ADS-B aircraft traffic awareness
- GPS-denied navigation support
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

## Frontend Components

### Layout Components (`client/src/components/layout/`)

| File | Purpose |
|------|---------|
| `TopBar.tsx` | Main navigation bar with system status, diagnostics, connection indicators, and user menu |
| `Sidebar.tsx` | Vertical navigation tabs for switching between panels (Map, Mission, Tracking, etc.) |

### Control Components (`client/src/components/controls/`)

| File | Purpose |
|------|---------|
| `ControlDeck.tsx` | Bottom control bar with ARM/DISARM, Takeoff, RTL, Land, Abort, and Gripper controls |

### Map Components (`client/src/components/map/`)

| File | Purpose |
|------|---------|
| `MapInterface.tsx` | Main Leaflet map with drone position, waypoints, flight path, address search, and layer switching (Satellite/2D/Hybrid) |
| `MissionMap.tsx` | Mission-specific map view for waypoint planning and editing |

### Panel Components (`client/src/components/panels/`)

| File | Purpose | Key Features |
|------|---------|--------------|
| `SettingsPanel.tsx` | System configuration | Connection settings, sensor config, camera presets, hardware ports, base location, Google integration |
| `MissionPlanningPanel.tsx` | Mission waypoint management | Add/edit/delete waypoints, set actions (hover, photo, drop/pickup, RTL), mission upload/download |
| `TrackingPanel.tsx` | Object tracking | Motion-based detection, IoU tracking for stable IDs, target lock/follow |
| `SpeakerPanel.tsx` | Audio broadcast | Text-to-speech, audio file playback, Pi GPIO/USB speaker support, Orange Cube+ buzzer |
| `FlightLogsPanel.tsx` | Flight history | Log viewing, export, delete with confirmation, mission replay |
| `AutomationPanel.tsx` | Custom scripts | Trigger-based automation (takeoff, landing, waypoint, battery, GPS lost, disconnect) |
| `TerminalCommandsPanel.tsx` | Command reference | 60+ commands for Orange Cube+, Here3+ GPS, ADS-B, LiDAR, missions |
| `UserAccessPanel.tsx` | User management | Role-based access (admin, operator, viewer), login/logout, session management |
| `GeofencingPanel.tsx` | Flight boundaries | Circular/polygon zones, address/coordinate entry, breach actions (RTL/land/hover/warn), altitude limits |
| `GUIConfigPanel.tsx` | Interface customization | Show/hide/reorder tabs, panel positions, draggability, theme selection |

### Telemetry Components (`client/src/components/telemetry/`)

| File | Purpose |
|------|---------|
| `TelemetryPanel.tsx` | Main telemetry display with altitude, speed, battery, GPS, motor data |
| `AttitudeIndicator.tsx` | Artificial horizon showing pitch and roll |
| `GyroscopeIndicator.tsx` | Gyroscope visualization |

### Video Components (`client/src/components/video/`)

| File | Purpose |
|------|---------|
| `VideoFeed.tsx` | Camera feed display with gimbal/thermal/FPV/webcam modes, zoom, recording, RTSP stream support |

### UI Components (`client/src/components/ui/`)

Reusable shadcn/ui primitives including: Button, Card, Dialog, Input, Select, Tabs, Toast, etc.

---

## Backend Services

### Server Files (`server/`)

| File | Purpose |
|------|---------|
| `index.ts` | Express server entry point, WebSocket setup for telemetry streaming |
| `routes.ts` | REST API endpoints for settings, missions, waypoints, logs, users |
| `storage.ts` | Database operations using Drizzle ORM with PostgreSQL |
| `static.ts` | Static file serving configuration |
| `vite.ts` | Vite development server integration |
| `googleSheets.ts` | Google Sheets backup integration |
| `googleDrive.ts` | Google Drive video storage integration |

### API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/settings` | GET/POST | Retrieve/save system settings |
| `/api/settings/:key` | GET/PUT/DELETE | Individual setting operations |
| `/api/missions` | GET/POST | List/create missions |
| `/api/missions/:id` | GET/PUT/DELETE | Individual mission operations |
| `/api/waypoints` | GET/POST | List/create waypoints |
| `/api/flight-logs` | GET/POST | Flight log management |
| `/api/users` | GET/POST | User management |
| `/api/geocode` | GET | Address to coordinates lookup |
| `/api/telemetry` | WebSocket | Real-time telemetry streaming |

---

## Database Schema

Located in `shared/schema.ts`:

| Table | Purpose |
|-------|---------|
| `settings` | Key-value configuration storage |
| `missions` | Mission definitions with name, status, waypoints |
| `waypoints` | Individual waypoint data (lat, lng, alt, action) |
| `flightLogs` | Historical flight data and statistics |
| `users` | User accounts with roles and permissions |
| `sensorData` | Sensor readings history |
| `motorTelemetry` | Motor performance data |
| `cameraSettings` | Camera configuration presets |

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
| `replit.md` | Project memory and preferences |

---

## Running the Application

### Development Mode

```bash
npm run dev
```

This starts the Express server with Vite for hot module reloading on port 5000.

### Production Build

```bash
npm run build
npm start
```

### Database Setup

The PostgreSQL database is automatically configured via the `DATABASE_URL` environment variable. Run migrations with:

```bash
npm run db:push
```

---

## Feature Documentation

### Terminal Commands

The Terminal Commands panel provides 60+ pre-configured commands organized by category:

**Categories:**
- **System** - Arm, disarm, reboot, calibrate, firmware
- **Flight** - Takeoff, land, RTL, altitude, speed modes
- **Mission** - Pause, resume, set home, get status
- **Orange Cube+ Sensors** - Accelerometer, gyroscope, barometers, magnetometer
- **Here3+ GPS** - Position, RTK status, compass, barometer, LED control
- **ADS-B** - Traffic list, range config, status
- **LiDAR** - Distance, rate, mode, calibration
- **Camera** - Stream, snapshot, zoom, thermal toggle

### Geofencing

Define flight boundaries with:
- **Circular zones** - Center point + radius
- **Polygon zones** - Multiple vertices
- **Breach actions** - RTL, land immediately, hover, warning only
- **Altitude limits** - Max/min altitude per zone

### Automation Scripts

Create trigger-based automation:
- **Triggers** - Takeoff, landing, waypoint reached, battery low, GPS lost, disconnect
- **Actions** - Execute commands, change modes, send alerts

### User Roles

| Role | Permissions |
|------|-------------|
| Admin | Full access, user management, settings |
| Operator | Flight control, mission planning, logs |
| Viewer | Read-only access to telemetry and maps |

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
| `mouse_custom_commands` | User-added terminal commands |

---

## Troubleshooting

### Connection Issues

1. Verify `DATABASE_URL` is set correctly
2. Check flight controller is connected via USB/UART
3. Ensure WebSocket port is not blocked

### Camera Feed

1. For laptop webcam: Grant browser camera permissions
2. For RTSP streams: Configure ffmpeg transcoding on Pi
3. For Skydroid C12: Connect via configured stream URL

### GPS/Sensors

1. Verify CAN bus connections for Here3+
2. Check I2C address for LW20/HA LiDAR
3. Run sensor calibration commands if readings are erratic

---

## Version History

- **v1.0** - Initial release with core GCS functionality
- **v1.1** - Added geofencing, GUI configuration, expanded terminal commands
- **v1.2** - Camera integration, RTSP support, improved HUD overlays

---

## License

Proprietary - M.O.U.S.E Ground Control Station
