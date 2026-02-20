@echo off
setlocal
set "BACKEND_DIR=%~dp0backend"

REM Check if backend already running; if yes, restart it
tasklist /FI "IMAGENAME eq SetLiveBackend.exe" /NH | find /I "SetLiveBackend.exe" >nul
if %ERRORLEVEL%==0 (
  taskkill /F /IM SetLiveBackend.exe >nul 2>&1
  timeout /t 2 >nul
)

REM Start backend server fresh
cd /d "%BACKEND_DIR%"
start "SETLIVE Backend" /min SetLiveBackend.exe

REM Give backend a few seconds to start
timeout /t 3 >nul

REM Open app in default browser via backend server
start "" "http://127.0.0.1:9000/"

endlocal
