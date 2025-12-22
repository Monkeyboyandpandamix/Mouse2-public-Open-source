# M.O.U.S.E. Ground Control Station
# Standalone Build Script for Windows (PowerShell)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "=========================================================="
Write-Host "  M.O.U.S.E. Ground Control Station"
Write-Host "  Standalone Build Script v1.0 (Windows)"
Write-Host "=========================================================="
Write-Host ""

# Get script directory
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
Set-Location $ProjectRoot

$Version = "1.0.0"
$OutputDir = Join-Path $ProjectRoot "standalone"
$DistName = "mouse-gcs-$Version"

Write-Host "Project root: $ProjectRoot"
Write-Host ""

# Check for Node.js
try {
    $NodeVersion = & node -v 2>$null
    Write-Host "[OK] Node.js version: $NodeVersion"
} catch {
    Write-Host "ERROR: Node.js is not installed!"
    Write-Host "Please install Node.js v18+ from https://nodejs.org/"
    exit 1
}

try {
    $NpmVersion = & npm -v 2>$null
    Write-Host "[OK] npm version: $NpmVersion"
} catch {
    Write-Host "ERROR: npm is not available!"
    exit 1
}

Write-Host ""

# Create clean output directory
if (Test-Path $OutputDir) {
    Remove-Item -Recurse -Force $OutputDir
}
New-Item -ItemType Directory -Path "$OutputDir\$DistName" -Force | Out-Null
New-Item -ItemType Directory -Path "$OutputDir\$DistName\data" -Force | Out-Null

# Install dependencies
Write-Host "Step 1: Installing dependencies..."
& npm install

# Build the application
Write-Host ""
Write-Host "Step 2: Building application..."
& npm run build

# Copy built files
Write-Host ""
Write-Host "Step 3: Copying files to standalone package..."
Copy-Item -Path "dist\*" -Destination "$OutputDir\$DistName\" -Recurse -Force

# Copy configuration files
Copy-Item -Path ".env.example" -Destination "$OutputDir\$DistName\" -Force
if (Test-Path "README.md") {
    Copy-Item -Path "README.md" -Destination "$OutputDir\$DistName\" -Force
}

# Create production package.json - extract runtime deps from original
Write-Host ""
Write-Host "Step 4: Creating production package.json..."

# Use Node.js to extract dependencies from original package.json
$NodeScript = @'
const pkg = require('./package.json');
const prodPkg = {
  name: 'mouse-gcs',
  version: '1.0.0',
  description: 'M.O.U.S.E. Ground Control Station',
  type: 'module',
  license: 'MIT',
  scripts: {
    start: 'set NODE_ENV=production && node index.cjs'
  },
  dependencies: pkg.dependencies || {},
  optionalDependencies: pkg.optionalDependencies || {},
  engines: { node: '>=18.0.0' }
};
console.log(JSON.stringify(prodPkg, null, 2));
'@
$PackageJson = & node -e $NodeScript
$PackageJson | Out-File -FilePath "$OutputDir\$DistName\package.json" -Encoding utf8

# Copy launcher scripts
Write-Host ""
Write-Host "Step 5: Copying launcher scripts..."
Copy-Item -Path "start-windows.bat" -Destination "$OutputDir\$DistName\" -Force
Copy-Item -Path "start-linux.sh" -Destination "$OutputDir\$DistName\" -Force
Copy-Item -Path "start-pi-onboard.sh" -Destination "$OutputDir\$DistName\" -Force

# Create INSTALL.txt
Write-Host ""
Write-Host "Step 6: Creating installation guide..."
$InstallTxt = @'
=============================================================
M.O.U.S.E. GROUND CONTROL STATION - INSTALLATION GUIDE
=============================================================

SYSTEM REQUIREMENTS
-------------------
- Node.js v18 or higher (download from https://nodejs.org/)
- 2GB RAM minimum (4GB recommended)
- 500MB disk space
- Modern web browser (Chrome, Firefox, Edge, Safari)

QUICK START (WINDOWS)
---------------------
1. Install Node.js from https://nodejs.org/ (LTS version)
2. Double-click start-windows.bat
3. Browser opens automatically to http://localhost:5000
4. Login with admin/admin123 (change password immediately!)

DEFAULT LOGIN
-------------
Username: admin
Password: admin123
IMPORTANT: Change this password immediately after first login!

CONFIGURATION
-------------
1. Copy .env.example to .env
2. Edit .env with your settings

For full documentation, see README.md
'@
$InstallTxt | Out-File -FilePath "$OutputDir\$DistName\INSTALL.txt" -Encoding utf8

# Install production dependencies
Write-Host ""
Write-Host "Step 7: Installing production dependencies..."
Push-Location "$OutputDir\$DistName"
& npm install --production --ignore-scripts
Pop-Location

# Create zip archive
Write-Host ""
Write-Host "Step 8: Creating distribution archive..."
$ZipPath = "$OutputDir\$DistName-windows.zip"
if (Test-Path $ZipPath) {
    Remove-Item $ZipPath -Force
}
Compress-Archive -Path "$OutputDir\$DistName" -DestinationPath $ZipPath

Write-Host ""
Write-Host "=========================================================="
Write-Host "  BUILD COMPLETE!"
Write-Host "=========================================================="
Write-Host ""
Write-Host "Output directory: $OutputDir"
Write-Host ""
Write-Host "Distribution files:"
Write-Host "  - $DistName\ (folder ready to use)"
Write-Host "  - $DistName-windows.zip"
Write-Host ""
Write-Host "To deploy:"
Write-Host "  1. Copy the zip to target machine"
Write-Host "  2. Extract the archive"
Write-Host "  3. Double-click start-windows.bat"
Write-Host ""
Write-Host "Node.js v18+ is required on the target machine."
Write-Host "Download from: https://nodejs.org/"
Write-Host ""
