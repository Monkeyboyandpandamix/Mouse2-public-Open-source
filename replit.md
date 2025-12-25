# M.O.U.S.E Ground Control Station

## Overview

M.O.U.S.E (Multi-purpose Operational Unmanned Aerial System for Emergency Response & Environmental Monitoring) is a comprehensive ground control station application for autonomous drone control. The system is designed to run on Raspberry Pi for onboard control and desktop/laptop for the primary ground control interface. It provides real-time telemetry, mission planning, object tracking, and two-way communication capabilities for drone operations, including GPS-denied environment support.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript using Vite as the build tool
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: TanStack React Query for server state and caching
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with custom CSS variables for theming
- **Mapping**: Leaflet for interactive map display with satellite, 2D, and hybrid views

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript with ESM modules
- **Real-time Communication**: WebSocket server (ws) for live telemetry streaming
- **API Design**: RESTful endpoints for CRUD operations on missions, waypoints, settings, and telemetry data

### Data Storage
- **Local Storage**: JSON files in `./data` directory for offline-first operation
- **Cloud Backup**: Google Drive for file storage, Google Sheets for structured data backup
- **Schema Location**: `shared/schema.ts` contains all type definitions using Zod
- **Data Files**: settings.json, missions.json, waypoints.json, drones.json, flight_logs.json, etc.
- **Auto-sync**: Data automatically syncs to Google Drive/Sheets when online (every 5 minutes)

### Deployment Modes
- **Ground Control Mode** (default): Runs on desktop/laptop, shows drone selection screen after login, requires manual drone connection
- **Onboard Mode**: Set `DEVICE_ROLE=ONBOARD` environment variable when running on Raspberry Pi; automatically skips drone selection and connects to local MAVLink at `/dev/ttyACM0`
- Runtime configuration available via `/api/runtime-config` endpoint

### Standalone Deployment
This application is fully portable and can be deployed without Replit:
- **No database required** - uses local JSON files in `./data` directory
- **Environment template**: Copy `.env.example` to `.env` and customize
- **Google integration optional** - set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` for cloud backup
- **Browser auto-launch optional** - set `NO_BROWSER=1` to disable

### Deployment Scripts
- **Windows**: `start-windows.bat` - Double-click to launch the ground control station
- **Linux**: `start-linux.sh` - Run with `./start-linux.sh` to launch
- **Raspberry Pi (Onboard)**: `start-pi-onboard.sh` - Run with `sudo ./start-pi-onboard.sh` for onboard mode
- All scripts: Install dependencies, build, and start the production server

### Standalone Build Scripts
- **Linux/macOS**: `scripts/build-standalone.sh` - Creates a complete distribution package with all dependencies
- **Windows PowerShell**: `scripts/build-standalone.ps1` - Creates a Windows-ready distribution package
- Output: `standalone/mouse-gcs-1.0.0/` folder with pre-installed dependencies, launchers, and archives (.tar.gz, .zip)

### Desktop Application (Electron)
The application can be run as a native desktop app using Electron:
- **Run Desktop App**: `./start-electron.sh` (Linux/macOS) or `start-electron.bat` (Windows)
- **Build Installers**: `./build-electron.sh` creates platform-specific installers in `electron-dist/`
- **Supported Platforms**: Windows (.exe installer, portable), macOS (.dmg), Linux (.AppImage, .deb)
- **Data Location**: User data stored in OS-specific app data directory (auto-created)
- **Features**: Native window, auto-starts embedded server, works completely offline

### Key Features
- **Multi-drone management**: Connect and control multiple drones from a single ground station with drone selection screen after login, real-time status display for all drones on map, individual geofencing per drone, and TopBar logo click to switch between drones
- **Preview mode**: Explore the interface without connecting a real drone by clicking "Preview Control Page" on drone selection
- Real-time telemetry panel showing altitude, speed, attitude, and motor data
- Interactive map with all connected drones visible, waypoints, flight path visualization from operator location, address search, hover tooltips showing drone status/battery/GPS/mission, and map controls for centering on drone or operator
- Mission planning with waypoint management and actions (hover, photo, drop/pickup payload, open gripper, RTL)
- Advanced AI-powered object tracking using TensorFlow.js COCO-SSD model for detecting stationary and moving objects (people, cars, trucks, motorcycles, bicycles), with multi-object tracking via IoU-based Hungarian assignment, velocity prediction for temporary occlusions, temporal confidence smoothing (0.7 EMA), and fallback motion detection for offline/degraded scenarios
- Audio broadcast system with Pi GPIO speaker, USB speaker, and Orange Cube+ buzzer support
- Flight controls including arm/disarm, takeoff, land, RTL, and emergency stop
- **Automatic Flight Recording**: Flight sessions auto-start on takeoff and auto-end on landing. Captures enhanced telemetry including motor RPM/current, vibration XYZ, battery temp, GPS HDOP, air speed, wind speed/direction, and distance from home. Calculates total flight time, max altitude, and distance traveled. Sessions sync to Google Sheets on completion
- **Servo/Gripper Control**: Hardware gripper control via GPIO 4 on Raspberry Pi using pigpio (preferred) or RPi.GPIO. API endpoints `/api/servo/control` (POST) and `/api/servo/status` (GET) available. On non-Pi platforms, returns simulated responses. Run `sudo ./scripts/setup-gpio-access.sh` once on Pi to enable sudo-less operation
- **BME688 Environmental Monitoring**: Real-time environmental sensor integration with AI-based gas classification. Features include:
  - Temperature (°F/°C), humidity, pressure, and altitude readings
  - Indoor Air Quality (IAQ) score calculation
  - AI gas classification detecting VOC, VSC, CO₂, H₂, CO, and ethanol levels
  - Health risk assessment (GOOD, MODERATE, HIGH, CRITICAL) with color-coded alerts
  - API endpoints `/api/bme688/read` and `/api/bme688/status` with simulation fallback for non-Pi environments
  - Environment panel in sidebar with auto-refresh and safe levels reference
- Google Sheets backup integration for data persistence
- Google Drive integration for video footage storage
- Laptop webcam testing mode for camera validation with object detection overlay
- Hardware presets for Skydroid C12, LW20/HA Lidar, Here3+ GPS configuration
- Base location configuration in Settings for RTL functionality
- Real system diagnostics (no simulations) - shows actual connection status
- Operations console always active with memory-conscious log trimming
- User authentication with role-based access (admin, operator, viewer) and full name display
- **Team Communication**: Real-time messaging between users in the Comms panel with timestamps, edit/delete functionality, and automatic Google Sheets backup for message history
- **Direct Messaging**: Type @ in the message input to DM specific users with autocomplete, Enter to confirm selection. DMs are private and only visible to sender and recipient via WebSocket user tracking
- **Message History**: Admins can view full message history including original content of edited/deleted messages via `/api/messages/history` endpoint (requires admin role)
- **Google Account Management**: Admins can sign in, switch, and remove Google accounts directly in the app (Settings > Storage). Supports both Replit integration mode and standalone OAuth mode for production deployments. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` environment variables for standalone mode
- **Server-Side Session Tokens**: Login creates cryptographically secure session tokens (256-bit entropy) stored server-side; tokens required for WebSocket DM routing and admin API access; sessions expire after 24 hours
- Automation scripts panel for custom flight automation with triggers (takeoff, landing, waypoint, battery low, GPS lost, disconnect)
- GPS-denied navigation failsafe using visual odometry, dead reckoning, and flight path history
- Autonomous mission completion on ground control disconnect with configurable RTL/hover/land actions
- Flight log management with delete functionality and confirmation dialogs
- Terminal commands panel with custom command creation and deletion
- GUI configuration with immediate "Apply Now" functionality, dark/light theme support with automatic persistence, and Google Sheets backup for tabs/panels/widgets
- **GUI Permission Controls**: Only administrators can create and delete custom tabs/widgets; all users with configure_gui_advanced permission can reorder and toggle visibility
- **Flight Path Optimizer**: Intelligent route optimization panel that analyzes missions based on real-time weather data (Open-Meteo API), terrain considerations, and waypoint ordering. Provides actionable suggestions for battery savings, time reduction, headwind avoidance, altitude optimization, and safety improvements with estimated savings percentages. Requires mission_planning permission.
- **Flight Logbook**: Comprehensive mission logging system that automatically records and categorizes all drone flights. Features include:
  - Mission categorization (training, survey, inspection, emergency, delivery, monitoring, other)
  - Searchable and filterable flight history with date ranges and category filters
  - Flight replay with animated map playback showing drone position, telemetry data, and progress slider
  - Editable flight records with mission names, ratings (1-5 stars), tags, weather conditions, notes, and incident reports
  - Statistics dashboard showing total flights, flight time, distance, monthly comparisons, and category breakdown
  - CSV export of filtered logbook data for external analysis

### Hardware Configuration
- **Companion Computer**: Raspberry Pi 5 (16GB) running Trixie 13.2
- **Flight Controller**: Orange Cube+ with ADSB Carrier Board
- **GPS**: Here3+ GPS Module (CAN-connected)
- **Lidar**: LW20/HA high-accuracy laser altimeter
- **Camera/Gimbal**: Skydroid C12 2K (2560x1440 HD + 384x288 Thermal, 7mm lens)
- **Propulsion**: Mad Motors XP6S Arms (x4)

### Project Structure
- `client/` - React frontend application
- `server/` - Express backend with API routes and WebSocket handling
- `shared/` - Shared TypeScript types and Zod schemas
- `data/` - Local JSON data storage (created automatically)
- `scripts/` - Build and deployment scripts
- `electron/` - Electron main process, preload scripts, and icons
- `attached_assets/` - Project requirements and reference documents

## External Dependencies

### Data Storage
- Local JSON files for offline-first operation
- Google Drive API for cloud file backup (via googleapis)
- Google Sheets API for structured data backup (via googleapis)

### Frontend Libraries
- Leaflet for mapping functionality
- Radix UI primitives for accessible components
- TanStack React Query for data fetching
- TensorFlow.js and COCO-SSD for AI object detection
- Various shadcn/ui components (accordion, dialog, tabs, etc.)

### Build Tools
- Vite for frontend development and bundling
- esbuild for server-side bundling
- TypeScript for type checking across the codebase
- Electron + electron-builder for desktop application packaging

### Real-time Communication
- WebSocket (ws) for live telemetry streaming between drone and ground station
