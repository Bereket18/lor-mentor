#!/usr/bin/env bash
# Syntax-check the host nginx configs without touching the real system nginx.
#
#   bash deploy/nginx/test-nginx-config.sh
#
# For each deploy/nginx/*.conf it:
#   1. copies the file into a temp dir,
#   2. rewrites the lormentor.com / www / api placeholders to the reserved
#      test domain example.test,
#   3. mints a throwaway self-signed certificate and repoints any
#      ssl_certificate / ssl_certificate_key directive at it,
#   4. wraps the conf in a minimal nginx.conf,
#   5. runs `nginx -t -c <wrapper>`.
#
# Exits non-zero if any config fails to parse. Used by the `nginx-syntax` job
# in .gitlab-ci.yml (official nginx image, empty entrypoint). On a machine
# without nginx it prints a notice and exits 0, so local runs stay harmless.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONF_DIR="$REPO_ROOT/deploy/nginx"
NGINX_BIN="${NGINX_BIN:-nginx}"

if ! command -v "$NGINX_BIN" >/dev/null 2>&1; then
  echo "nginx binary not found (set NGINX_BIN) - skipping syntax check."
  exit 0
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

mkdir -p "$WORK/conf.d" "$WORK/logs" "$WORK/certs"

if command -v openssl >/dev/null 2>&1; then
  openssl req -x509 -newkey rsa:2048 -nodes -days 1 \
    -keyout "$WORK/certs/example.test.key" \
    -out "$WORK/certs/example.test.crt" \
    -subj "/CN=example.test" >/dev/null 2>&1
fi

status=0
found=0
for conf in "$CONF_DIR"/*.conf; do
  [ -e "$conf" ] || continue
  found=1
  name="$(basename "$conf")"
  target="$WORK/conf.d/$name"

  # Key rule first: `ssl_certificate` is a prefix of `ssl_certificate_key`, so
  # the key substitution must happen before the certificate one.
  sed \
    -e 's/lormentor\.com/example.test/g' \
    -e "s#ssl_certificate_key[[:space:]]\+[^;]*#ssl_certificate_key $WORK/certs/example.test.key#g" \
    -e "s#ssl_certificate[[:space:]]\+[^;]*#ssl_certificate $WORK/certs/example.test.crt#g" \
    "$conf" > "$target"

  cat > "$WORK/nginx.conf" <<EOF
worker_processes 1;
error_log $WORK/logs/error.log warn;
events { worker_connections 64; }
http {
    include $WORK/conf.d/$name;
}
EOF

  if "$NGINX_BIN" -t -c "$WORK/nginx.conf" -p "$WORK" 2>"$WORK/logs/$name.log"; then
    echo "OK   $name"
  else
    echo "FAIL $name"
    cat "$WORK/logs/$name.log"
    status=1
  fi
done

if [ "$found" -eq 0 ]; then
  echo "No .conf files under deploy/nginx - nothing to check."
fi

exit "$status"
