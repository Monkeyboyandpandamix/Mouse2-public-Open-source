#!/bin/bash
# Build script for M.O.U.S.E. Ground Control Station
# Creates a standalone distribution for Windows and Linux

set -e

echo "Building M.O.U.S.E. Ground Control Station..."

# Create dist directory
mkdir -p dist/mouse-gcs
mkdir -p dist/mouse-gcs/data

# Build the frontend
echo "Building frontend..."
npm run build

# Copy built files
cp -r dist/public dist/mouse-gcs/public 2>/dev/null || true
cp -r client/dist dist/mouse-gcs/client 2>/dev/null || true

# Bundle the server
echo "Bundling server..."
npx esbuild server/index.ts --bundle --platform=node --target=node18 --outfile=dist/mouse-gcs/server.js --external:googleapis

# Copy necessary files
cp package.json dist/mouse-gcs/
cp -r data dist/mouse-gcs/ 2>/dev/null || true

# Create launcher scripts
echo "Creating launcher scripts..."

# Windows batch file
cat > dist/mouse-gcs/start-windows.bat << 'EOF'
@echo off
echo Starting M.O.U.S.E. Ground Control Station...
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo Node.js is not installed!
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

REM Set environment variables
set NODE_ENV=production
set PORT=5000
set DATA_DIR=.\data

REM Install dependencies if needed
if not exist node_modules (
    echo Installing dependencies...
    npm install --production
)

REM Start the server
echo Starting server on http://localhost:5000
start http://localhost:5000
node server.js

pause
EOF

# Linux shell script
cat > dist/mouse-gcs/start-linux.sh << 'EOF'
#!/bin/bash
echo "Starting M.O.U.S.E. Ground Control Station..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Node.js is not installed!"
    echo "Install with: sudo apt install nodejs npm"
    exit 1
fi

# Set environment variables
export NODE_ENV=production
export PORT=5000
export DATA_DIR=./data

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install --production
fi

# Create data directory
mkdir -p data

# Start the server
echo "Starting server on http://localhost:5000"
xdg-open http://localhost:5000 2>/dev/null || open http://localhost:5000 2>/dev/null || true
node server.js
EOF

# Raspberry Pi specific script
cat > dist/mouse-gcs/start-pi-onboard.sh << 'EOF'
#!/bin/bash
echo "Starting M.O.U.S.E. in ONBOARD mode (Raspberry Pi)..."

# Set environment variables for onboard mode
export NODE_ENV=production
export PORT=5000
export DATA_DIR=./data
export DEVICE_ROLE=ONBOARD

# Check if running as root (needed for serial port access)
if [ "$EUID" -ne 0 ]; then 
    echo "Warning: Not running as root. Serial port access may fail."
    echo "Consider running with: sudo ./start-pi-onboard.sh"
fi

# Create data directory
mkdir -p data

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install --production
fi

# Start the server
echo "Starting server on http://localhost:5000"
echo "MAVLink will connect to /dev/ttyACM0"
node server.js
EOF

chmod +x dist/mouse-gcs/start-linux.sh
chmod +x dist/mouse-gcs/start-pi-onboard.sh

echo ""
echo "Build complete! Distribution created in dist/mouse-gcs/"
echo ""
echo "To run:"
echo "  Windows: Double-click start-windows.bat"
echo "  Linux:   ./start-linux.sh"
echo "  Raspberry Pi (Onboard): sudo ./start-pi-onboard.sh"
