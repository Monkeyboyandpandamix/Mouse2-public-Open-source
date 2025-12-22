#!/bin/bash
# Build script for M.O.U.S.E. Ground Control Station
# Creates a standalone distribution for Windows and Linux

set -e

echo ""
echo "=========================================================="
echo "  M.O.U.S.E. Ground Control Station"
echo "  Standalone Build Script v1.0"
echo "=========================================================="
echo ""

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

VERSION="1.0.0"
OUTPUT_DIR="$PROJECT_ROOT/standalone"
DIST_NAME="mouse-gcs-$VERSION"

echo "Project root: $PROJECT_ROOT"
echo ""

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed!"
    echo "Please install Node.js v18+ from https://nodejs.org/"
    exit 1
fi

echo "[OK] Node.js version: $(node -v)"
echo "[OK] npm version: $(npm -v)"
echo ""

# Create clean output directory
rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR/$DIST_NAME"
mkdir -p "$OUTPUT_DIR/$DIST_NAME/data"

# Install dependencies
echo "Step 1: Installing dependencies..."
npm install

# Build the application
echo ""
echo "Step 2: Building application..."
npm run build

# Copy built files
echo ""
echo "Step 3: Copying files to standalone package..."
cp -r dist/* "$OUTPUT_DIR/$DIST_NAME/" 2>/dev/null || true

# Copy configuration files
cp .env.example "$OUTPUT_DIR/$DIST_NAME/"
cp README.md "$OUTPUT_DIR/$DIST_NAME/" 2>/dev/null || true

# Create production package.json - copy the full dependencies from project
# The esbuild bundles some deps but leaves others as external
echo ""
echo "Step 4: Creating production package.json..."

# Extract only the runtime dependencies from the original package.json
# We need all dependencies except devDependencies
node -e "
const pkg = require('./package.json');
const prodPkg = {
  name: 'mouse-gcs',
  version: '1.0.0',
  description: 'M.O.U.S.E. Ground Control Station',
  type: 'module',
  license: 'MIT',
  scripts: {
    start: 'NODE_ENV=production node index.cjs'
  },
  dependencies: pkg.dependencies || {},
  optionalDependencies: pkg.optionalDependencies || {},
  engines: { node: '>=18.0.0' }
};
console.log(JSON.stringify(prodPkg, null, 2));
" > "$OUTPUT_DIR/$DIST_NAME/package.json"

# Create launcher scripts
echo ""
echo "Step 5: Creating launcher scripts..."

# Windows batch file
cat > "$OUTPUT_DIR/$DIST_NAME/start-windows.bat" << 'EOF'
@echo off
title M.O.U.S.E. Ground Control Station
echo.
echo  ===================================================
echo   M.O.U.S.E. Ground Control Station
echo   Mission Optimized Unmanned System Environment
echo  ===================================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ERROR: Node.js is not installed!
    echo.
    echo Please install Node.js from https://nodejs.org/
    echo Download the LTS version (v20 or later) for Windows.
    echo.
    pause
    exit /b 1
)

REM Set environment variables
set NODE_ENV=production
set PORT=5000
set DATA_DIR=.\data

REM Create data directory if needed
if not exist data mkdir data

REM Install dependencies if needed
if not exist node_modules (
    echo Installing dependencies...
    call npm install --production
)

echo.
echo Starting server on http://localhost:%PORT%
echo.
echo Press Ctrl+C to stop the server.
echo.

REM Open browser unless NO_BROWSER is set
if not defined NO_BROWSER (
    echo Opening browser...
    start "" http://localhost:%PORT%
)

REM Start the production server
node index.cjs

pause
EOF

# Linux shell script
cat > "$OUTPUT_DIR/$DIST_NAME/start-linux.sh" << 'EOF'
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

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install --production
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
node index.cjs
EOF

# Raspberry Pi specific script
cat > "$OUTPUT_DIR/$DIST_NAME/start-pi-onboard.sh" << 'EOF'
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

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install --production
fi

echo ""
echo "Starting in ONBOARD mode..."
echo "MAVLink will connect to: /dev/ttyACM0"
echo "Web interface: http://localhost:$PORT"
echo ""
echo "Press Ctrl+C to stop the server."
echo ""

# Start the production server (no browser open for headless Pi)
node index.cjs
EOF

chmod +x "$OUTPUT_DIR/$DIST_NAME/start-linux.sh"
chmod +x "$OUTPUT_DIR/$DIST_NAME/start-pi-onboard.sh"

# Create INSTALL.txt guide
echo ""
echo "Step 6: Creating installation guide..."
cat > "$OUTPUT_DIR/$DIST_NAME/INSTALL.txt" << 'EOF'
=============================================================
M.O.U.S.E. GROUND CONTROL STATION - INSTALLATION GUIDE
=============================================================

SYSTEM REQUIREMENTS
-------------------
- Node.js v18 or higher (download from https://nodejs.org/)
- 2GB RAM minimum (4GB recommended)
- 500MB disk space
- Modern web browser (Chrome, Firefox, Edge, Safari)

QUICK START
-----------
Windows:
  1. Install Node.js from https://nodejs.org/ (LTS version)
  2. Double-click start-windows.bat
  3. Browser opens automatically to http://localhost:5000
  4. Login with admin/admin123 (change password immediately!)

Linux/macOS:
  1. Install Node.js: sudo apt install nodejs npm
  2. Make script executable: chmod +x start-linux.sh
  3. Run: ./start-linux.sh
  4. Open browser to http://localhost:5000

Raspberry Pi (Onboard Mode):
  1. Install Node.js:
     curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
     sudo apt install -y nodejs
  2. Run: sudo ./start-pi-onboard.sh
  3. Access from any device on network: http://<PI_IP>:5000

FIRST-TIME SETUP
----------------
1. Login with default admin account (admin/admin123)
2. IMMEDIATELY change the admin password in User Management
3. Configure your base location in Settings > General
4. (Optional) Set up Google integration for cloud backup

CONFIGURATION
-------------
1. Copy .env.example to .env
2. Edit .env with your settings:

   Required:
   - PORT: Server port (default 5000)
   - SESSION_SECRET: Random 32+ character string for security

   Optional (for Google cloud backup):
   - GOOGLE_CLIENT_ID: From Google Cloud Console
   - GOOGLE_CLIENT_SECRET: From Google Cloud Console

GOOGLE INTEGRATION (OPTIONAL)
-----------------------------
1. Go to https://console.cloud.google.com/
2. Create a project and enable Drive & Sheets APIs
3. Create OAuth credentials (Web application type)
4. Set redirect URI: http://localhost:5000/api/google/oauth/callback
5. Copy Client ID and Secret to your .env file

INCLUDED FILES
--------------
- index.cjs        : Compiled server application
- public/          : Frontend web application
- data/            : Local data storage (auto-created)
- .env.example     : Configuration template
- start-*.bat/sh   : Startup scripts for each OS
- INSTALL.txt      : This file
- README.md        : Full documentation

TROUBLESHOOTING
---------------
"Node.js not found":
  - Install Node.js v18+ from https://nodejs.org/

"Port 5000 already in use":
  - Change PORT in .env file, or
  - Kill the process using port 5000

"Permission denied" (Linux):
  - Run with sudo, or
  - chmod +x the script file

"Cannot connect to flight controller":
  - Check USB cable connection
  - Verify correct port in Settings > Hardware
  - Linux: sudo usermod -a -G dialout $USER (then logout/login)

DEFAULT LOGIN
-------------
Username: admin
Password: admin123
IMPORTANT: Change this password immediately after first login!

SUPPORT
-------
For full documentation, see README.md
EOF

# Install production dependencies
echo ""
echo "Step 7: Installing production dependencies..."
cd "$OUTPUT_DIR/$DIST_NAME"
npm install --production --ignore-scripts
cd "$PROJECT_ROOT"

# Create archives
echo ""
echo "Step 8: Creating distribution archives..."
cd "$OUTPUT_DIR"

# Create tarball
echo "  - Creating tar.gz..."
tar -czf "$DIST_NAME-linux.tar.gz" "$DIST_NAME"

# Create zip if available
if command -v zip &> /dev/null; then
    echo "  - Creating zip..."
    zip -rq "$DIST_NAME-windows.zip" "$DIST_NAME"
fi

echo ""
echo "=========================================================="
echo "  BUILD COMPLETE!"
echo "=========================================================="
echo ""
echo "Output directory: $OUTPUT_DIR"
echo ""
echo "Distribution files:"
echo "  - $DIST_NAME/ (folder ready to use)"
echo "  - $DIST_NAME-linux.tar.gz"
if [ -f "$DIST_NAME-windows.zip" ]; then
    echo "  - $DIST_NAME-windows.zip"
fi
echo ""
echo "To deploy:"
echo "  1. Copy the archive to target machine"
echo "  2. Extract the archive"
echo "  3. Run the appropriate start script"
echo ""
echo "Node.js v18+ is required on the target machine."
echo "Download from: https://nodejs.org/"
echo ""
