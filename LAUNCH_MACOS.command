#!/bin/bash
cd "$(dirname "$0")"
python3 -m http.server 8765 --bind 127.0.0.1 -d src &
sleep 1
open "http://127.0.0.1:8765"
