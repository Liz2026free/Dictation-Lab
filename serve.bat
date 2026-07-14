@echo off
cd /d "%~dp0"
echo.
echo ========================================
echo   DictationLab is starting...
echo   Open this address in your browser:
echo.
echo      http://localhost:8765
echo.
echo   Keep this window open while using.
echo   Press Ctrl+C to stop the server.
echo ========================================
echo.
python -m http.server 8765
if errorlevel 1 (
  echo.
  echo Python failed. Trying py launcher...
  py -m http.server 8765
)
pause
