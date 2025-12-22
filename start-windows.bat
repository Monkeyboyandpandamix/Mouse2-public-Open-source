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

REM Optional: Set NO_BROWSER=1 to disable auto-opening browser
REM set NO_BROWSER=1

REM Create data directory if needed
if not exist data mkdir data

REM Install ALL dependencies (needed for TypeScript build)
if not exist node_modules (
    echo Installing dependencies...
    call npm install
)

REM Build the application
echo.
echo Building application...
call npm run build
if %ERRORLEVEL% neq 0 (
    echo Build failed! Please check for errors.
    pause
    exit /b 1
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
set NODE_ENV=production
node dist/index.cjs

pause
