$root = "D:\chit fund"
$req = Join-Path $root "Requirement"
$backend = Join-Path $root "backend"
$frontend = Join-Path $root "frontend"

Write-Host "=== Chit Fund Client Full Setup ==="

Write-Host ""
Write-Host "1/4 - Checking Python..."
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
  $pyInstaller = Join-Path $req "Python\python-3.13.12-amd64.exe"
  if (Test-Path $pyInstaller) {
    Write-Host "Python not found. Starting Python installer..."
    Start-Process $pyInstaller -Wait
  } else {
    Write-Host "Python installer not found at $pyInstaller"
  }
} else {
  Write-Host "Python already available."
}

Write-Host ""
Write-Host "2/4 - Checking Node.js..."
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  $nodeInstaller = Join-Path $req "Node\node-v24.13.1-x64.msi"
  if (Test-Path $nodeInstaller) {
    Write-Host "Node.js not found. Starting Node.js installer..."
    Start-Process msiexec.exe -ArgumentList @("/i", "`"$nodeInstaller`"", "/qn") -Wait
  } else {
    Write-Host "Node installer not found at $nodeInstaller"
  }
} else {
  Write-Host "Node.js already available."
}

Write-Host ""
Write-Host "3/4 - Installing backend Python packages..."
if (Test-Path $backend) {
  Push-Location $backend
  if (Test-Path "requirements.txt") {
    Write-Host "Running: python -m pip install -r requirements.txt"
    python -m pip install -r requirements.txt
  } else {
    Write-Host "requirements.txt not found in $backend"
  }
  Pop-Location
} else {
  Write-Host "Backend folder not found at $backend"
}

Write-Host ""
Write-Host "4/4 - Installing frontend Node packages..."
if (Test-Path $frontend) {
  Push-Location $frontend
  if (Test-Path "package.json") {
    Write-Host "Running: npm install"
    npm install
  } else {
    Write-Host "package.json not found in $frontend"
  }
  Pop-Location
} else {
  Write-Host "Frontend folder not found at $frontend"
}

Write-Host ""
Write-Host "Creating desktop shortcut for Chit Fund App..."
try {
  $wsh = New-Object -ComObject WScript.Shell
  $desktop = [Environment]::GetFolderPath('Desktop')
  $shortcutPath = Join-Path $desktop "ChitFund App.lnk"
  $vbsPath = Join-Path $root "start_app.vbs"
  if (Test-Path $vbsPath) {
    $shortcut = $wsh.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = $vbsPath
    $shortcut.WorkingDirectory = $root
    $shortcut.IconLocation = $vbsPath
    $shortcut.Save()
    Write-Host "Desktop shortcut created at $shortcutPath"
  } else {
    Write-Host "start_app.vbs not found at $vbsPath. Shortcut not created."
  }
} catch {
  Write-Host "Unable to create desktop shortcut: $($_.Exception.Message)"
}

Write-Host ""
Write-Host "Setup steps finished. You can start the app using the desktop shortcut or by running start_app.vbs."
