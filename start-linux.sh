#!/bin/bash
set -u

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

# Vite 7 requires Node >=20.19 or >=22.12 (warning only, but build issues are possible)
NODE_MINOR=$(node -v | cut -d'.' -f2)
if [ "$NODE_VERSION" -eq 22 ] && [ "$NODE_MINOR" -lt 12 ]; then
    echo "WARNING: Node $(node -v) is below Vite's recommended 22.12+ for Node 22."
    echo "Recommended: use Node 20 LTS (20.19+) or upgrade Node 22 to 22.12+."
    echo ""
fi

# Set environment variables
export PORT=${PORT:-5000}
export DATA_DIR=${DATA_DIR:-./data}

# Create data directory
mkdir -p "$DATA_DIR"

# Stop previous M.O.U.S.E server instances so dist/ cleanup during build
# doesn't break a currently running server and cause ENOENT on index.html.
if pgrep -f "node dist/index.cjs" >/dev/null 2>&1; then
    echo "Stopping existing M.O.U.S.E server instance(s)..."
    pkill -f "node dist/index.cjs" >/dev/null 2>&1 || true
    sleep 1
fi

install_deps() {
    echo "Installing dependencies..."
    npm install --include=dev
    if [ $? -ne 0 ]; then
        echo ""
        echo "Initial install failed. Attempting clean reinstall..."
        rm -rf node_modules
        npm cache clean --force >/dev/null 2>&1 || true
        npm install --include=dev
        if [ $? -ne 0 ]; then
            echo "Dependency installation failed after retry."
            echo "Try running: rm -rf node_modules && npm cache clean --force && npm install --include=dev"
            exit 1
        fi
    fi
}

# Install ALL dependencies including dev (needed for TypeScript build)
if [ ! -d "node_modules" ] || [ ! -f "node_modules/.bin/tsx" ]; then
    install_deps
fi

# Verify build tooling exists
if [ ! -f "node_modules/.bin/tsx" ]; then
    echo "ERROR: tsx is missing after installation."
    echo "Run: npm install --include=dev"
    exit 1
fi

# Build the application
echo ""
echo "Building application..."
./node_modules/.bin/tsx script/build.ts
if [ $? -ne 0 ]; then
    echo "Build failed! Please check for errors."
    exit 1
fi

# If requested/default port is in use, find the next available one.
if command -v lsof >/dev/null 2>&1; then
    BASE_PORT="$PORT"
    while lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; do
        PORT=$((PORT + 1))
        if [ "$PORT" -gt $((BASE_PORT + 50)) ]; then
            echo "ERROR: Could not find an open port in range ${BASE_PORT}-$((BASE_PORT + 50))."
            exit 1
        fi
    done
    export PORT
    if [ "$PORT" -ne "$BASE_PORT" ]; then
        echo "Port $BASE_PORT is already in use. Switching to port $PORT."
        echo ""
    fi
fi

echo ""
echo "Starting server on http://localhost:$PORT"
echo ""
echo "Press Ctrl+C to stop the server."
echo ""

APP_URL="http://localhost:$PORT/?v=$(date +%s)"
echo "Open this URL if browser does not auto-open:"
echo "  $APP_URL"
echo ""

# Open browser unless NO_BROWSER is set
if [ -z "${NO_BROWSER:-}" ]; then
    echo "Opening browser..."
    (sleep 2 && xdg-open "$APP_URL" 2>/dev/null || open "$APP_URL" 2>/dev/null) &
fi

# Start the production server
export NODE_ENV=production
node dist/index.cjs
