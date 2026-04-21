@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Port 3001 ve 5173 temizleniyor, ardından yeniden başlatılıyor...
call npm run restart:dev
pause
