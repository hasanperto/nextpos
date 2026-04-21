# NextPOS Full System Backup Script
$backupDir = "d:\xampp\htdocs\nextpos\backups"
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$dbBackupName = "nextpos_db_$timestamp.sql"
$codeBackupName = "nextpos_code_$timestamp.zip"

if (!(Test-Path $backupDir)) {
    New-Item -ItemType Directory -Path $backupDir
}

Write-Host "🚀 Starting NextPOS Backup..." -ForegroundColor Cyan

# 1. Database Backup
$possiblePaths = @(
    "C:\Program Files\PostgreSQL\16\bin\pg_dump.exe",
    "C:\Program Files\PostgreSQL\15\bin\pg_dump.exe",
    "C:\Program Files\PostgreSQL\14\bin\pg_dump.exe",
    "C:\Program Files\PostgreSQL\13\bin\pg_dump.exe"
)

$pgDumpPath = $null
foreach ($path in $possiblePaths) {
    if (Test-Path $path) {
        $pgDumpPath = $path
        break
    }
}

if ($pgDumpPath) {
    Write-Host "📦 Dumping Database using $pgDumpPath..." -ForegroundColor Yellow
    $env:PGPASSWORD = "nextpos"
    & "$pgDumpPath" -h 127.0.0.1 -p 5433 -U nextpos -F p nextpos | Out-File -FilePath "$backupDir\$dbBackupName" -Encoding utf8
    if ($?) {
        Write-Host "✅ DB Backup Complete: $dbBackupName" -ForegroundColor Green
    } else {
        Write-Host "❌ DB Backup Failed." -ForegroundColor Red
    }
} else {
    Write-Host "⚠️ pg_dump.exe not found in standard paths. Skipping DB backup." -ForegroundColor Red
}

# 2. Codebase Backup
Write-Host "📂 Compressing Codebase (excluding large folders)..." -ForegroundColor Yellow

# We'll use a simplified method to avoid parser errors
$source = "d:\xampp\htdocs\nextpos"
$destination = "$backupDir\$codeBackupName"

# Using a temp directory for clean zip
$temp = "d:\xampp\htdocs\nextpos_backup_tmp"
if (Test-Path $temp) { Remove-Item -Recurse -Force $temp }
New-Item -ItemType Directory -Path $temp | Out-Null

Write-Host "   - Preparing temporary files..." -ForegroundColor Gray
# Copy everything EXCEPT node_modules and other large folders
# Robocopy is the most reliable for this on Windows
robocopy $source $temp /S /XD node_modules .next dist build .turbo .git backups /XF *.log /R:0 /W:0 /NJH /NJS /NFL /NDL | Out-Null

Write-Host "   - Creating ZIP archive..." -ForegroundColor Gray
Compress-Archive -Path "$temp\*" -DestinationPath $destination -Force

Write-Host "   - Cleaning up..." -ForegroundColor Gray
Remove-Item -Recurse -Force $temp

Write-Host "✅ Code Backup Complete: $codeBackupName" -ForegroundColor Green
Write-Host "⭐ All backups stored in: $backupDir" -ForegroundColor Cyan
