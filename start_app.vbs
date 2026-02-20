Set WshShell = CreateObject("WScript.Shell")

' Backend server (FastAPI / Uvicorn) - hidden
WshShell.Run "cmd /c cd /d ""D:\chit fund\backend"" && python -m uvicorn main:app --reload --port 9000", 0, False

' Frontend dev server (Vite / npm) - hidden
WshShell.Run "cmd /c cd /d ""D:\chit fund\frontend"" && npm run dev", 0, False

' Small delay to let servers start
WScript.Sleep 5000

' Open browser to frontend
WshShell.Run "http://localhost:5173/", 1, False
