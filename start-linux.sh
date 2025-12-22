#!/bin/bash
echo ""
echo "==================================================="
echo "  M.O.U.S.E. Ground Control Station"
echo "  Mission Optimized Unmanned System Environment"
echo "==================================================="
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed!"
    echo ""
    echo "Install Node.js with one of these commands:"
    echo "  Ubuntu/Debian: sudo apt install nodejs npm"
    echo "  Fedora:        sudo dnf install nodejs npm"
    echo "  Arch:          sudo pacman -S nodejs npm"
    echo ""
    exit 1
fi

# Set environment variables
export NODE_ENV=production
export PORT=5000
export DATA_DIR=./data

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
echo "Starting server on http://localhost:5000"
echo "Opening browser..."
echo ""
echo "Press Ctrl+C to stop the server."
echo ""

# Try to open browser
(sleep 2 && xdg-open http://localhost:5000 2>/dev/null || open http://localhost:5000 2>/dev/null) &

# Start the production server
export NODE_ENV=production
node dist/index.js
