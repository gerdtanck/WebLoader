@echo off
cd /d "%~dp0"
if not exist node_modules\vite (
  echo Bitte einmal npm ci im WebLoader-Ordner ausfuehren.
  pause
  exit /b 1
)
call npm run dev
