@echo off
title Poji - Dev Server
cd /d "%~dp0"
echo.
echo  ====================================
echo    Poji - Starting dev server...
echo  ====================================
echo.
start "" http://localhost:8081
npx expo start --web
pause
