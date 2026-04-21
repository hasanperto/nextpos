Param(
    [switch]$Release
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$androidDir = Join-Path $projectRoot "apps\mobile-android"

Set-Location $androidDir

if (!(Test-Path ".\gradlew.bat")) {
    if (Get-Command gradle -ErrorAction SilentlyContinue) {
        Write-Host "gradlew.bat yok, gradle ile wrapper olusturuluyor..."
        gradle wrapper
    } else {
        throw "Gradle bulunamadi. Gradle kurun veya gradlew.bat ekleyin."
    }
}

$task = if ($Release) { ":app:assembleRelease" } else { ":app:assembleDebug" }
Write-Host "Android build baslatiliyor: $task"
& .\gradlew.bat --no-daemon clean $task
