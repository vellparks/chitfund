$base = "D:\chit fund\Requirement"
New-Item -ItemType Directory -Force -Path $base, "$base\Python", "$base\Node", "$base\Tools", "$base\Editors", "$base\Git" | Out-Null

Write-Host "Downloading Python 3.13.12 (64-bit) installer..."
Invoke-WebRequest -Uri "https://www.python.org/ftp/python/3.13.12/python-3.13.12-amd64.exe" -OutFile "$base\Python\python-3.13.12-amd64.exe"

Write-Host "Downloading Node.js 24.13.1 (includes npm) installer..."
Invoke-WebRequest -Uri "https://nodejs.org/dist/v24.13.1/node-v24.13.1-x64.msi" -OutFile "$base\Node\node-v24.13.1-x64.msi"

Write-Host "Downloading DB Browser for SQLite 3.13.1 (optional tool) installer..."
Invoke-WebRequest -Uri "https://download.sqlitebrowser.org/DB.Browser.for.SQLite-v3.13.1-win64.msi" -OutFile "$base\Tools\DB.Browser.for.SQLite-v3.13.1-win64.msi"

Write-Host "Downloading VS Code (64-bit user installer)..."
Invoke-WebRequest -Uri "https://update.code.visualstudio.com/latest/win32-x64-user/stable" -OutFile "$base\Editors\VSCodeSetup-x64.exe"

Write-Host "Downloading Git for Windows (64-bit) installer..."
Invoke-WebRequest -Uri "https://github.com/git-for-windows/git/releases/latest/download/Git-64-bit.exe" -OutFile "$base\Git\Git-64-bit.exe"

Write-Host "All downloads finished. Files saved under $base."
