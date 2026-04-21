@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo NextPOS — API + POS geliştirme sunucusu başlıyor...
echo Kapatmak için bu pencerede Ctrl+C
call npm run dev:stack
pause
