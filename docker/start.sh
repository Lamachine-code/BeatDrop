#!/usr/bin/env bash
set -Eeuo pipefail

: "${PORT:?Render must provide PORT}"

# Only substitute PORT: Nginx variables such as $host must remain untouched.
envsubst '${PORT}' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf

pnpm --filter @beatdrop/realtime start &
REALTIME_PID=$!

pnpm --filter @beatdrop/web start -- --hostname 127.0.0.1 &
WEB_PID=$!

nginx -g 'daemon off;' &
NGINX_PID=$!

shutdown() {
  kill "$NGINX_PID" "$WEB_PID" "$REALTIME_PID" 2>/dev/null || true
}
trap shutdown TERM INT

set +e
wait -n "$NGINX_PID" "$WEB_PID" "$REALTIME_PID"
STATUS=$?
set -e

shutdown
wait 2>/dev/null || true
exit "$STATUS"
