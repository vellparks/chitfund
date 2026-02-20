@echo off
setlocal
start "Chit Backend" /min cmd /K "cd /d D:\chit fund\backend && python -m uvicorn main:app --reload --port 9000"
start "Chit Frontend" /min cmd /K "cd /d D:\chit fund\frontend && npm run dev"
echo Backend and frontend servers are starting...
timeout /t 5 >nul
start "" "http://localhost:5173/"
exit /B 0
