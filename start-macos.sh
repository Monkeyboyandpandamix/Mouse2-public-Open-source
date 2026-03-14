#!/bin/bash
set -u

echo ""
echo "==================================================="
echo "  M.O.U.S.E. Ground Control Station"
echo "  macOS Launcher"
echo "==================================================="
echo ""

if [ "$(uname -s)" != "Darwin" ]; then
  echo "ERROR: start-macos.sh is for macOS only."
  echo "Use start-linux.sh on Linux or start-pi-onboard.sh on Raspberry Pi."
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node.js is not installed."
  echo "Install Node 20.19+ (LTS) or Node 22.12+."
  exit 1
fi

NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
NODE_MINOR=$(node -p "process.versions.node.split('.')[1]")
if [ "$NODE_MAJOR" -lt 20 ] || { [ "$NODE_MAJOR" -eq 22 ] && [ "$NODE_MINOR" -lt 12 ]; }; then
  echo "WARNING: Node $(node -v) may be below Vite's recommended version."
  echo "Recommended: Node 20.19+ LTS or Node 22.12+."
  echo ""
fi

export PORT=${PORT:-5000}
export DATA_DIR=${DATA_DIR:-./data}
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
    echo "Initial install failed. Retrying with clean node_modules..."
    rm -rf node_modules
    npm cache clean --force >/dev/null 2>&1 || true
    npm install --include=dev
    if [ $? -ne 0 ]; then
      echo "Dependency installation failed after retry."
      exit 1
    fi
  fi
}

if [ ! -d "node_modules" ] || [ ! -f "node_modules/.bin/tsx" ]; then
  install_deps
fi

if [ ! -f "node_modules/.bin/tsx" ]; then
  echo "ERROR: tsx is missing after installation."
  echo "Run: npm install --include=dev"
  exit 1
fi

echo ""
echo "Building application..."
./node_modules/.bin/tsx script/build.ts
if [ $? -ne 0 ]; then
  echo "Build failed! Please check for errors."
  exit 1
fi

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
    echo "Port $BASE_PORT is in use. Switching to $PORT."
  fi
fi

echo ""
echo "Starting server on http://localhost:$PORT"
echo "Press Ctrl+C to stop the server."
echo ""

APP_URL="http://localhost:$PORT/?v=$(date +%s)"
echo "Open this URL if browser does not auto-open:"
echo "  $APP_URL"
echo ""

if [ -z "${NO_BROWSER:-}" ]; then
  echo "Opening browser..."
  (sleep 2 && open "$APP_URL" 2>/dev/null) &
fi

export NODE_ENV=production
node dist/index.cjs
