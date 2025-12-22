# M.O.U.S.E Ground Control Station

## Overview

M.O.U.S.E (Mission Optimized Unmanned System Environment) is a comprehensive ground control station application for autonomous drone control. The system is designed to run on Raspberry Pi for onboard control and desktop/laptop for the primary ground control interface. It provides real-time telemetry, mission planning, object tracking, and two-way communication capabilities for drone operations, including GPS-denied environment support.

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

### Deployment Scripts
- **Windows**: `start-windows.bat` - Double-click to launch the ground control station
- **Linux**: `start-linux.sh` - Run with `./start-linux.sh` to launch
- **Raspberry Pi (Onboard)**: `start-pi-onboard.sh` - Run with `sudo ./start-pi-onboard.sh` for onboard mode

### Key Features
- **Multi-drone management**: Connect and control multiple drones from a single ground station with drone selection screen after login, real-time status display for all drones on map, individual geofencing per drone, and TopBar logo click to switch between drones
- **Preview mode**: Explore the interface without connecting a real drone by clicking "Preview Control Page" on drone selection
- Real-time telemetry panel showing altitude, speed, attitude, and motor data
- Interactive map with all connected drones visible, waypoints, flight path visualization, address search, and hover tooltips showing drone status/battery/GPS/mission
- Mission planning with waypoint management and actions (hover, photo, drop/pickup payload, RTL)
- Advanced AI-powered object tracking using TensorFlow.js COCO-SSD model for detecting stationary and moving objects (people, cars, trucks, motorcycles, bicycles), with multi-object tracking via IoU-based Hungarian assignment, velocity prediction for temporary occlusions, temporal confidence smoothing (0.7 EMA), and fallback motion detection for offline/degraded scenarios
- Audio broadcast system with Pi GPIO speaker, USB speaker, and Orange Cube+ buzzer support
- Flight controls including arm/disarm, takeoff, land, RTL, and emergency stop
- Gripper control for payload drop/pickup operations
- Google Sheets backup integration for data persistence
- Google Drive integration for video footage storage
- Laptop webcam testing mode for camera validation with object detection overlay
- Hardware presets for Skydroid C12, LW20/HA Lidar, Here3+ GPS configuration
- Base location configuration in Settings for RTL functionality
- Real system diagnostics (no simulations) - shows actual connection status
- Operations console always active with memory-conscious log trimming
- User authentication with role-based access (admin, operator, viewer) and full name display
- Automation scripts panel for custom flight automation with triggers (takeoff, landing, waypoint, battery low, GPS lost, disconnect)
- GPS-denied navigation failsafe using visual odometry, dead reckoning, and flight path history
- Autonomous mission completion on ground control disconnect with configurable RTL/hover/land actions
- Flight log management with delete functionality and confirmation dialogs
- Terminal commands panel with custom command creation and deletion
- GUI configuration with immediate "Apply Now" functionality

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

### Real-time Communication
- WebSocket (ws) for live telemetry streaming between drone and ground station
