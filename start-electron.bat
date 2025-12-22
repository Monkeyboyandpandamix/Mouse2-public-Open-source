@echo off
title M.O.U.S.E. Ground Control Station - Desktop
echo.
echo  ===================================================
echo   M.O.U.S.E. Ground Control Station
echo   Desktop Application Mode
echo  ===================================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ERROR: Node.js is not installed!
    echo Please install Node.js v20 or later from https://nodejs.org/
    pause
    exit /b 1
)

REM Set environment variables
set PORT=5000
set DATA_DIR=.\data

REM Create data directory if needed
if not exist data mkdir data

REM Install dependencies if needed
if not exist node_modules\\.bin\\tsx (
    echo Installing dependencies...
    call npm install --include=dev
)

REM Build the application if dist doesn't exist
if not exist dist (
    echo.
    echo Building application...
    call .\node_modules\.bin\tsx script/build.ts
    if %ERRORLEVEL% neq 0 (
        echo Build failed! Please check for errors.
        pause
        exit /b 1
    )
)

echo.
echo Starting M.O.U.S.E. Desktop Application...
echo.

REM Run Electron
call .\node_modules\.bin\electron electron/main.js

pause
