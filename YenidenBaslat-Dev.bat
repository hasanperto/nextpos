@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Port 3101 (API), 5173 (POS), 5176 (Admin), 4001 (Reseller), 4003 (QR Menu) temizleniyor, ardından yeniden başlatılıyor...
call npm run restart:all
pause
