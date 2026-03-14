@echo off
setlocal EnableExtensions EnableDelayedExpansion
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

for /f "tokens=1,2 delims=." %%a in ('node -p "process.versions.node"') do (
    set NODE_MAJOR=%%a
    set NODE_MINOR=%%b
)
if !NODE_MAJOR! LSS 20 (
    echo WARNING: Node.js !NODE_MAJOR!.!NODE_MINOR! may be too old for Vite 7.
    echo Recommended: Node 20.19+ or Node 22.12+.
    echo.
) else if !NODE_MAJOR! EQU 22 if !NODE_MINOR! LSS 12 (
    echo WARNING: Node.js !NODE_MAJOR!.!NODE_MINOR! is below recommended 22.12+.
    echo Recommended: Node 20.19+ or Node 22.12+.
    echo.
)

REM Stop previous M.O.U.S.E server instances so dist/ cleanup during build
REM doesn't break a currently running server and cause ENOENT on index.html.
for /f %%p in ('powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -match 'dist/index.cjs' } | Select-Object -ExpandProperty ProcessId"') do (
    echo Stopping existing M.O.U.S.E server instance %%p...
    taskkill /PID %%p /F >nul 2>nul
)

REM Set environment variables
if not defined PORT set PORT=5000
set DATA_DIR=.\data

REM Optional: Set NO_BROWSER=1 to disable auto-opening browser
REM set NO_BROWSER=1

REM Create data directory if needed
if not exist data mkdir data

set INSTALL_FAILED=0

REM Install ALL dependencies including dev (needed for TypeScript build)
if not exist node_modules\\.bin\\tsx (
    echo Installing dependencies...
    call npm install --include=dev
    if !ERRORLEVEL! neq 0 (
        set INSTALL_FAILED=1
    )
)

if !INSTALL_FAILED! neq 0 (
    echo Initial install failed. Retrying clean install...
    if exist node_modules rmdir /s /q node_modules
    call npm cache clean --force >nul 2>nul
    call npm install --include=dev
    if !ERRORLEVEL! neq 0 (
        echo Dependency installation failed after retry.
        pause
        exit /b 1
    )
)

if not exist node_modules\\.bin\\tsx (
    echo ERROR: tsx is missing after installation.
    pause
    exit /b 1
)

REM Build the application
echo.
echo Building application...
call .\node_modules\.bin\tsx script/build.ts
if %ERRORLEVEL% neq 0 (
    echo Build failed! Please check for errors.
    pause
    exit /b 1
)

REM If requested/default port is in use, pick next available one
set BASE_PORT=%PORT%
:PORT_CHECK
set PORT_IN_USE=
for /f %%i in ('netstat -ano ^| findstr /R /C:":%PORT% .*LISTENING"') do (
    set PORT_IN_USE=1
    goto PORT_TAKEN
)
goto PORT_OK

:PORT_TAKEN
set /a PORT=%PORT%+1
if %PORT% GTR %BASE_PORT%+50 (
    echo ERROR: Could not find an open port in range %BASE_PORT%-%BASE_PORT%+50.
    pause
    exit /b 1
)
goto PORT_CHECK

:PORT_OK
if not %PORT%==%BASE_PORT% (
    echo Port %BASE_PORT% is already in use. Switching to port %PORT%.
    echo.
)

echo.
echo Starting server on http://localhost:%PORT%
echo.
echo Press Ctrl+C to stop the server.
echo.
set APP_URL=http://localhost:%PORT%/?v=%RANDOM%%RANDOM%
echo Open this URL if browser does not auto-open:
echo   %APP_URL%
echo.

REM Open browser unless NO_BROWSER is set
if not defined NO_BROWSER (
    echo Opening browser...
    start "" %APP_URL%
)

REM Start the production server
set NODE_ENV=production
node dist/index.cjs

pause
