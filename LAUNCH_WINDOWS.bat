@echo off
title QBAS - Generador de Recibos - QBASWING DESIGNER
cd /d "%~dp0"
echo ============================================================
echo    QBAS - Generador de Recibos
echo    "Recibos profesionales, en segundos."
echo    by QBASWING DESIGNER
echo ============================================================
echo.
start "" /b python -m http.server 8765 --bind 127.0.0.1 -d src
timeout /t 2 >nul
start "" "http://127.0.0.1:8765"
echo Aplicacion abierta en el navegador: http://127.0.0.1:8765
echo Cierra esta ventana para detener el servidor.
pause >nul
