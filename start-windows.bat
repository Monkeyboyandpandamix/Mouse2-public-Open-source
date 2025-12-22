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
    echo Download the LTS version for Windows.
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
echo Building application...
call npm run build

echo.
echo Starting server on http://localhost:5000
echo Opening browser...
echo.
echo Press Ctrl+C to stop the server.
echo.

REM Open browser after a short delay
start "" http://localhost:5000

REM Start the production server
set NODE_ENV=production
node dist/index.js

pause
