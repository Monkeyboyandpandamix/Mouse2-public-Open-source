#!/bin/bash
echo ""
echo "==================================================="
echo "  M.O.U.S.E. Ground Control Station"
echo "  ONBOARD MODE - Raspberry Pi"
echo "==================================================="
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed!"
    echo ""
    echo "Install on Raspberry Pi with:"
    echo "  sudo apt update"
    echo "  sudo apt install nodejs npm"
    echo ""
    exit 1
fi

# Check for serial port access
if [ ! -c /dev/ttyACM0 ]; then
    echo "WARNING: /dev/ttyACM0 not found"
    echo "Make sure the flight controller is connected via USB."
    echo ""
fi

# Check if running as root (needed for serial port access)
if [ "$EUID" -ne 0 ]; then 
    echo "WARNING: Not running as root."
    echo "Serial port access may fail. Consider running with:"
    echo "  sudo ./start-pi-onboard.sh"
    echo ""
fi

# Set environment variables for onboard mode
export NODE_ENV=production
export PORT=5000
export DATA_DIR=./data
export DEVICE_ROLE=ONBOARD

# Create data directory
mkdir -p data

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install --production
fi

echo ""
echo "Building application..."
npm run build

echo ""
echo "Starting in ONBOARD mode..."
echo "MAVLink will connect to: /dev/ttyACM0"
echo "Web interface: http://localhost:5000"
echo ""
echo "Press Ctrl+C to stop the server."
echo ""

# Start the production server
export NODE_ENV=production
node dist/index.js
