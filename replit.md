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
- **Tables**: Settings, missions, waypoints, flight logs, sensor data, motor telemetry, camera settings
- **Migrations**: Managed via drizzle-kit with output to `./migrations`

### Key Features
- Real-time telemetry panel showing altitude, speed, attitude, and motor data
- Interactive map with drone position, waypoints, flight path visualization, and address search
- Mission planning with waypoint management and actions (hover, photo, drop/pickup payload, RTL)
- Object tracking panel for computer vision-based target following
- Audio broadcast system with Pi GPIO speaker, USB speaker, and Orange Cube+ buzzer support
- Flight controls including arm/disarm, takeoff, land, RTL, and emergency stop
- Gripper control for payload drop/pickup operations
- Google Sheets backup integration for data persistence
- Laptop webcam testing mode for camera validation
- Hardware presets for Skydroid C12, LW20/HA Lidar, Here3+ GPS configuration

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