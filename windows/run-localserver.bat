@echo off
REM Double-click this file on Windows to launch the server and open the public URL.
SET SCRIPT_DIR=%~dp0
cd /d "%SCRIPT_DIR%.."
node launcher\start-app.js
pause
