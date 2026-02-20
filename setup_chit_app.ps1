Write-Host "=== Finance App Setup Wizard ===" -ForegroundColor Cyan

Write-Host "`n[1/4] Hardware checking..." -ForegroundColor Cyan

$os = Get-CimInstance Win32_OperatingSystem
$cs = Get-CimInstance Win32_ComputerSystem

$osName = $os.Caption
$osArch = $os.OSArchitecture
$ramGB = [math]::Round($cs.TotalPhysicalMemory / 1GB, 1)

Write-Host "OS   : $osName ($osArch)"
Write-Host "RAM  : $ramGB GB"

if ($osArch -notlike "*64*") {
    Write-Host "ERROR: 32-bit OS detected. Need 64-bit Windows 10/11." -ForegroundColor Red
    exit 1
}
if ($ramGB -lt 4) {
    Write-Host "WARNING: RAM < 4GB. App may be slow." -ForegroundColor Yellow
}

$drive = Get-PSDrive -Name "C" -ErrorAction SilentlyContinue
if (-not $drive) {
    $drive = Get-PSDrive -Name "D" -ErrorAction SilentlyContinue
}
if (-not $drive) {
    Write-Host "ERROR: Cannot find C: or D: drive." -ForegroundColor Red
    exit 1
}
$freeGB = [math]::Round($drive.Free / 1GB, 1)
Write-Host "Disk : $($drive.Name) free = $freeGB GB"

if ($freeGB -lt 5) {
    Write-Host "ERROR: Need at least 5GB free space." -ForegroundColor Red
    exit 1
}

Write-Host "`n[2/4] Software checking..." -ForegroundColor Cyan

$pythonOk = $false
$nodeOk   = $false

try {
    $pyOut = python --version 2>&1
    if ($LASTEXITCODE -eq 0) {
        $pyVer = ($pyOut -split " ")[1]
        Write-Host "Python: $pyVer" -ForegroundColor Green
        $m,$n = ($pyVer -split "\.")[0..1]
        if ([int]$m -gt 3 -or ([int]$m -eq 3 -and [int]$n -ge 10)) {
            $pythonOk = $true
        } else {
            Write-Host "Python version too low (need 3.10+)" -ForegroundColor Yellow
        }
    } else {
        Write-Host "Python command failed" -ForegroundColor Yellow
    }
} catch {
    Write-Host "Python not found" -ForegroundColor Yellow
}

try {
    $nodeOut = node --version 2>&1
    if ($LASTEXITCODE -eq 0) {
        $nodeVer = $nodeOut.TrimStart("v")
        Write-Host "Node.js: v$nodeVer" -ForegroundColor Green
        $nodeOk = $true
    } else {
        Write-Host "Node.js command failed" -ForegroundColor Yellow
    }
} catch {
    Write-Host "Node.js not found" -ForegroundColor Yellow
}

Write-Host "`n[3/4] Installing missing software..." -ForegroundColor Cyan

if (-not $pythonOk) {
    $pyUrl  = "https://www.python.org/ftp/python/3.11.8/python-3.11.8-amd64.exe"
    $pyFile = "$env:TEMP\python311-installer.exe"
    Write-Host "Downloading Python 3.11.8..." -ForegroundColor Cyan
    Invoke-WebRequest -Uri $pyUrl -OutFile $pyFile
    Write-Host "Starting Python installer (please follow wizard)..." -ForegroundColor Yellow
    Start-Process $pyFile
}

if (-not $nodeOk) {
    $nodeUrl  = "https://nodejs.org/dist/v22.11.0/node-v22.11.0-x64.msi"
    $nodeFile = "$env:TEMP\node-v22-installer.msi"
    Write-Host "Downloading Node.js..." -ForegroundColor Cyan
    Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeFile
    Write-Host "Starting Node.js installer (please follow wizard)..." -ForegroundColor Yellow
    Start-Process "msiexec.exe" -ArgumentList "/i `"$nodeFile`""
}

if (-not $pythonOk -or -not $nodeOk) {
    Write-Host "`nPlease finish Python/Node installation, then run this script again." -ForegroundColor Yellow
    exit 0
}

Write-Host "`n[4/4] Installing Finance/Chit app..." -ForegroundColor Cyan

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$appSource = $scriptDir

$defaultTarget = "D:\chit fund"
Write-Host ""
Write-Host "Default install path: $defaultTarget" -ForegroundColor Cyan
$inputTarget = Read-Host "Enter install path or press ENTER for default"
if ([string]::IsNullOrWhiteSpace($inputTarget)) {
    $appTarget = $defaultTarget
} else {
    $appTarget = $inputTarget.Trim()
}

if (-not (Test-Path $appTarget)) {
    New-Item -ItemType Directory -Path $appTarget -Force | Out-Null
}

Write-Host "Copying app files to $appTarget ..." -ForegroundColor Cyan
Copy-Item -Path (Join-Path $appSource "backend") -Destination $appTarget -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item -Path (Join-Path $appSource "frontend") -Destination $appTarget -Recurse -Force -ErrorAction SilentlyContinue

$batPath = Join-Path $appTarget "start_app.bat"
@"
@echo off
cd /d "$appTarget\backend"
start cmd /k "python -m uvicorn main:app --reload --port 9000"
cd /d "$appTarget\frontend"
start cmd /k "npm run dev"
echo.
echo Backend: http://localhost:9000/settings
echo Frontend: http://localhost:5173/
pause
"@ | Set-Content -Path $batPath -Encoding ASCII

Write-Host "App files copied to $appTarget. Use start_app.bat to launch backend and frontend." -ForegroundColor Green
Write-Host "Setup completed." -ForegroundColor Green
