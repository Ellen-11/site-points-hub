#!/bin/sh
set -eu

mkdir -p /data/browser-profile /tmp/browser-runtime
export DISPLAY=:99

Xvfb :99 -screen 0 1365x768x24 -ac +extension RANDR >/tmp/xvfb.log 2>&1 &
sleep 1
openbox >/tmp/openbox.log 2>&1 &
x11vnc -display :99 -forever -shared -localhost -nopw -rfbport 5900 >/tmp/x11vnc.log 2>&1 &
websockify 127.0.0.1:6080 127.0.0.1:5900 >/tmp/websockify.log 2>&1 &
chromium --no-sandbox --disable-dev-shm-usage --disable-gpu --remote-debugging-address=127.0.0.1 --remote-debugging-port=9222 --remote-allow-origins='*' --user-data-dir=/data/browser-profile --no-first-run --no-default-browser-check --start-maximized about:blank >/tmp/chromium.log 2>&1 &

exec npm start
