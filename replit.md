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
- **Database**: PostgreSQL with Drizzle ORM
- **Schema Location**: `shared/schema.ts` contains all table definitions
- **Tables**: Settings, missions, waypoints, flight logs, sensor data, motor telemetry, camera settings, drones
- **Migrations**: Managed via drizzle-kit with output to `./migrations`

### Key Features
- **Multi-drone management**: Connect and control multiple drones from a single ground station with drone selection screen after login, real-time status display for all drones on map, individual geofencing per drone, and TopBar logo click to switch between drones
- Real-time telemetry panel showing altitude, speed, attitude, and motor data
- Interactive map with all connected drones visible, waypoints, flight path visualization, address search, and hover tooltips showing drone status/battery/GPS/mission
- Mission planning with waypoint management and actions (hover, photo, drop/pickup payload, RTL)
- Advanced object tracking with multi-scale detection (8px/16px/32px blocks), background subtraction for static objects, global motion compensation, IoU + color histogram matching, velocity prediction, and click-to-lock persistent tracking
- Audio broadcast system with Pi GPIO speaker, USB speaker, and Orange Cube+ buzzer support
- Flight controls including arm/disarm, takeoff, land, RTL, and emergency stop
- Gripper control for payload drop/pickup operations
- Google Sheets backup integration for data persistence
- Google Drive integration for video footage storage
- Laptop webcam testing mode for camera validation with object detection overlay
- Hardware presets for Skydroid C12, LW20/HA Lidar, Here3+ GPS configuration
- Base location configuration in Settings for RTL functionality
- Auto system diagnostics with manual override in top bar
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
- `shared/` - Shared TypeScript types and database schema
- `attached_assets/` - Project requirements and reference documents

## External Dependencies

### Database
- PostgreSQL database (connection via `DATABASE_URL` environment variable)
- Drizzle ORM for type-safe database operations
- connect-pg-simple for session storage

### Frontend Libraries
- Leaflet for mapping functionality
- Radix UI primitives for accessible components
- TanStack React Query for data fetching
- Various shadcn/ui components (accordion, dialog, tabs, etc.)

### Build Tools
- Vite for frontend development and bundling
- esbuild for server-side bundling
- TypeScript for type checking across the codebase

### Real-time Communication
- WebSocket (ws) for live telemetry streaming between drone and ground station