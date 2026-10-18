@echo off
cd /d "%~dp0"
if not exist node_modules\astro\package.json (
  echo Installing project dependencies...
  call npm install
  if errorlevel 1 exit /b 1
)
call npm run dev
pause