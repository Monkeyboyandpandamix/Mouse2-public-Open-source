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
    echo "Or use Node Version Manager (nvm):"
    echo "  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash"
    echo "  nvm install 20"
    echo ""
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "WARNING: Node.js version is below v18. Some features may not work."
    echo "Current version: $(node -v)"
    echo ""
fi

# Set environment variables
export NODE_ENV=production
export PORT=${PORT:-5000}
export DATA_DIR=${DATA_DIR:-./data}

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
npx tsx script/build.ts
if [ $? -ne 0 ]; then
    echo "Build failed! Please check for errors."
    exit 1
fi

echo ""
echo "Starting server on http://localhost:$PORT"
echo ""
echo "Press Ctrl+C to stop the server."
echo ""

# Open browser unless NO_BROWSER is set
if [ -z "$NO_BROWSER" ]; then
    echo "Opening browser..."
    (sleep 2 && xdg-open "http://localhost:$PORT" 2>/dev/null || open "http://localhost:$PORT" 2>/dev/null) &
fi

# Start the production server
export NODE_ENV=production
node dist/index.cjs
