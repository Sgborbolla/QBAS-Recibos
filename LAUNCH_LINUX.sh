#!/bin/bash
# QBAS - Generador de Recibos  |  "Recibos profesionales, en segundos."  |  QBASWING DESIGNER
cd "$(dirname "$0")"
echo "============================================================"
echo "   QBAS - Generador de Recibos"
echo "   Recibos profesionales, en segundos."
echo "   by QBASWING DESIGNER"
echo "============================================================"
python3 -m http.server 8765 --bind 127.0.0.1 -d src &
sleep 1
(xdg-open "http://127.0.0.1:8765" 2>/dev/null || open "http://127.0.0.1:8765" 2>/dev/null)
echo "Abierto en: http://127.0.0.1:8765"
echo "Cierra esta terminal para detener el servidor."
wait
