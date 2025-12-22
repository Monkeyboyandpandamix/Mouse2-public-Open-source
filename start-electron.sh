#!/bin/bash
echo ""
echo "==================================================="
echo "  M.O.U.S.E. Ground Control Station"
echo "  Desktop Application Mode"
echo "==================================================="
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed!"
    echo "Please install Node.js v20 or later."
    exit 1
fi

# Set environment variables
export PORT=${PORT:-5000}
export DATA_DIR=${DATA_DIR:-./data}

# Create data directory
mkdir -p "$DATA_DIR"

# Install dependencies if needed
if [ ! -d "node_modules" ] || [ ! -f "node_modules/.bin/tsx" ]; then
    echo "Installing dependencies..."
    npm install --include=dev
fi

# Build the application if dist doesn't exist
if [ ! -d "dist" ]; then
    echo ""
    echo "Building application..."
    ./node_modules/.bin/tsx script/build.ts
    if [ $? -ne 0 ]; then
        echo "Build failed! Please check for errors."
        exit 1
    fi
fi

echo ""
echo "Starting M.O.U.S.E. Desktop Application..."
echo ""

# Run Electron
./node_modules/.bin/electron electron/main.cjs
