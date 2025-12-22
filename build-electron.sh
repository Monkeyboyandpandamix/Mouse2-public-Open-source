#!/bin/bash
echo ""
echo "==================================================="
echo "  M.O.U.S.E. Ground Control Station"
echo "  Building Desktop Application Installers"
echo "==================================================="
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed!"
    exit 1
fi

# Set environment variables
export PORT=5000
export DATA_DIR=./data

# Create data directory
mkdir -p "$DATA_DIR"

# Install dependencies if needed
if [ ! -d "node_modules" ] || [ ! -f "node_modules/.bin/tsx" ]; then
    echo "Installing dependencies..."
    npm install --include=dev
fi

# Build the web application first
echo ""
echo "Building web application..."
./node_modules/.bin/tsx script/build.ts
if [ $? -ne 0 ]; then
    echo "Web build failed!"
    exit 1
fi

# Determine platform and build
echo ""
echo "Building Electron application..."

case "$(uname -s)" in
    Linux*)
        echo "Building for Linux..."
        ./node_modules/.bin/electron-builder --linux --config electron-builder.config.js
        ;;
    Darwin*)
        echo "Building for macOS..."
        ./node_modules/.bin/electron-builder --mac --config electron-builder.config.js
        ;;
    CYGWIN*|MINGW*|MSYS*)
        echo "Building for Windows..."
        ./node_modules/.bin/electron-builder --win --config electron-builder.config.js
        ;;
    *)
        echo "Unknown platform. Building for current platform..."
        ./node_modules/.bin/electron-builder --config electron-builder.config.js
        ;;
esac

if [ $? -eq 0 ]; then
    echo ""
    echo "==================================================="
    echo "  Build completed successfully!"
    echo "  Check the 'electron-dist' folder for installers."
    echo "==================================================="
else
    echo ""
    echo "Build failed! Please check for errors."
    exit 1
fi
