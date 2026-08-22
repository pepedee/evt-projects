@echo off
set "PATH=C:\Program Files\nodejs;%PATH%"
cd /d "%~dp0"
call npm run dev -- -p 3006
echo.
echo Server stopped or failed to start (exit code %errorlevel%). Press any key to close.
pause >nul
