@echo off
title PickleFlow
cd /d "%~dp0"

echo.
echo  PICKLEFLOW - Starting...
echo  Player login:  http://localhost:3000/login
echo  Dashboard:     http://localhost:3000/dashboard
echo.
echo  Keep this window open.
echo.

set "PATH=C:\Program Files\nodejs;%PATH%"

if not exist "node_modules\" (
  echo Installing packages...
  call npm install
)

if exist ".next\" (
  echo Clearing cached build so layout updates apply...
  rmdir /s /q ".next"
)

start "" cmd /c "timeout /t 4 /nobreak >nul && start http://localhost:3000/dashboard"
npm run dev

pause
