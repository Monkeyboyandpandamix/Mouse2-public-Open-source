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
    echo "Or for the latest version:"
    echo "  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -"
    echo "  sudo apt install -y nodejs"
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
    echo "Or add your user to the dialout group:"
    echo "  sudo usermod -a -G dialout $USER"
    echo "  (Log out and back in for changes to take effect)"
    echo ""
fi

# Set environment variables for onboard mode
export NODE_ENV=production
export PORT=${PORT:-5000}
export DATA_DIR=${DATA_DIR:-./data}
export DEVICE_ROLE=ONBOARD

# Create data directory
mkdir -p "$DATA_DIR"

# Install ALL dependencies (needed for TypeScript build)
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Build the application
echo ""
echo "Building application..."
npm run build
if [ $? -ne 0 ]; then
    echo "Build failed! Please check for errors."
    exit 1
fi

echo ""
echo "Starting in ONBOARD mode..."
echo "MAVLink will connect to: /dev/ttyACM0"
echo "Web interface: http://localhost:$PORT"
echo ""
echo "Press Ctrl+C to stop the server."
echo ""

# Start the production server (no browser open for headless Pi)
export NODE_ENV=production
node dist/index.cjs
