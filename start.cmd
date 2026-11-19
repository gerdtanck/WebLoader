@echo off
cd /d "%~dp0"
if not exist node_modules\vite (
  echo Run npm ci in the WebLoader folder first.
  pause
  exit /b 1
)
call npm run dev
