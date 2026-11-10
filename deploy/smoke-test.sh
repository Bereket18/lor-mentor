#!/usr/bin/env bash
# Automated production smoke + security test for the Lor Mentor API.
#
# Tests the things that CAN be checked without a real inbox / browser / seeded
# data: liveness, readiness, security headers, CORS, auth rejections, input
# validation, and rate limiting. The full user journey (register → verify email
# → pay → admin) still needs the MANUAL checklist in DEPLOYMENT.md §6.
#
# Usage:
#   deploy/smoke-test.sh https://api.lormentor.com https://lormentor.com
#          $1 = API base URL          $2 = web origin (CORS + web pages)
#
# Local Next dev server (no nginx in front, so no immutable model header):
#   SMOKE_STRICT_CACHE=0 deploy/smoke-test.sh http://127.0.0.1:4000 http://localhost:3000
set -uo pipefail

API="${1:-http://127.0.0.1:4000}"
ORIGIN="${2:-http://localhost:3000}"
API="${API%/}"
ORIGIN="${ORIGIN%/}"
BASE="$API/api/v1"
STRICT_CACHE="${SMOKE_STRICT_CACHE:-1}"
pass=0; fail=0

ok()   { echo "  ✅ $1"; pass=$((pass+1)); }
bad()  { echo "  ❌ $1"; fail=$((fail+1)); }

# code URL [METHOD] [JSON body]  → echoes the HTTP status code
code() {
  local url="$1" method="${2:-GET}" body="${3:-}"
  if [ -n "$body" ]; then
    curl -s -o /dev/null -w '%{http_code}' -X "$method" \
      -H 'Content-Type: application/json' -d "$body" "$url"
  else
    curl -s -o /dev/null -w '%{http_code}' -X "$method" "$url"
  fi
}

echo "▶ Smoke-testing $BASE"
echo

echo "1) Health"
[ "$(code "$BASE/health")" = 200 ] && ok "liveness 200" || bad "liveness not 200"
[ "$(code "$BASE/health/ready")" = 200 ] && ok "readiness 200 (DB up)" || bad "readiness not 200 (DB down?)"

echo "2) Security headers (helmet)"
hdrs="$(curl -s -D - -o /dev/null "$BASE/health")"
echo "$hdrs" | grep -qi 'x-content-type-options: nosniff' && ok "X-Content-Type-Options" || bad "missing X-Content-Type-Options"
echo "$hdrs" | grep -qi 'x-frame-options'                  && ok "X-Frame-Options"        || bad "missing X-Frame-Options"
echo "$hdrs" | grep -qiv 'x-powered-by'                    && ok "no X-Powered-By"         || bad "X-Powered-By leaked"

echo "3) TLS (only when API is https)"
case "$API" in
  https://*) curl -sI "$API" >/dev/null 2>&1 && ok "HTTPS reachable" || bad "HTTPS handshake failed" ;;
  *) echo "  ⏭  skipped (API not https)";;
esac

echo "4) Auth rejections"
[ "$(code "$BASE/me")" = 401 ] && ok "protected /me → 401 when unauthenticated" || bad "/me not 401"
c=$(code "$BASE/auth/login" POST '{"email":"nobody@example.com","password":"wrongpass"}')
{ [ "$c" = 401 ] || [ "$c" = 400 ]; } && ok "bad login rejected ($c)" || bad "bad login not rejected ($c)"

echo "5) Input validation (whitelist)"
c=$(code "$BASE/auth/register" POST '{"email":"not-an-email"}')
[ "$c" = 400 ] && ok "invalid register body → 400" || bad "invalid register not 400 ($c)"

echo "6) No user enumeration on forgot-password"
c=$(code "$BASE/auth/forgot-password" POST '{"email":"definitely-not-a-user@example.com"}')
{ [ "$c" = 200 ] || [ "$c" = 400 ]; } && ok "forgot-password generic ($c)" || bad "forgot-password leaked ($c)"

echo "7) CORS allowlist"
acao=$(curl -s -D - -o /dev/null -H "Origin: $ORIGIN" "$BASE/health" | grep -i 'access-control-allow-origin' || true)
echo "$acao" | grep -qi "$ORIGIN" && ok "allows configured origin" || echo "  ⚠️  no ACAO for $ORIGIN (ok if same-origin proxy)"
evil=$(curl -s -D - -o /dev/null -H "Origin: https://evil.example" "$BASE/health" | grep -i 'access-control-allow-origin' | grep -i 'evil.example' || true)
[ -z "$evil" ] && ok "rejects unknown origin" || bad "reflects arbitrary origin!"

echo "8) Rate limiting (login is 5/min)"
rl=0
for _ in 1 2 3 4 5 6 7; do
  [ "$(code "$BASE/auth/login" POST '{"email":"rl@example.com","password":"x"}')" = 429 ] && rl=1 && break
done
[ "$rl" = 1 ] && ok "429 after burst" || bad "no 429 seen (throttler off?)"

echo "9) Anatomy Lab (web + API)"
# Health is already covered in §1; these checks cover the public anatomy surface.
[ "$(code "$BASE/anatomy/systems")" = 401 ] && ok "unauthenticated anatomy systems → 401" || bad "anatomy systems not 401 when unauthenticated"

# The GLB is served by the web origin (Next public/ or nginx), not the API.
model_headers="$(curl -sS -D - -o /dev/null "$ORIGIN/models/anatomy/heart.v2.glb" 2>/dev/null || true)"
model_status="$(printf '%s' "$model_headers" | awk 'NR==1 {print $2}')"
[ "$model_status" = 200 ] && ok "heart.v2.glb → 200" || bad "heart.v2.glb not 200 ($model_status)"
printf '%s' "$model_headers" | grep -qi '^content-type: model/gltf-binary' \
  && ok "heart.v2.glb content-type model/gltf-binary" \
  || bad "heart.v2.glb wrong or missing content-type"
if printf '%s' "$model_headers" | grep -qi '^cache-control:.*max-age=31536000' \
  && printf '%s' "$model_headers" | grep -qi '^cache-control:.*immutable'; then
  ok "heart.v2.glb immutable long cache header"
elif [ "$STRICT_CACHE" = 1 ]; then
  bad "heart.v2.glb missing immutable cache header (is nginx in front?)"
else
  echo "  ⏭  model cache header skipped (SMOKE_STRICT_CACHE=0; dev server)"
fi

attr_body="$(mktemp)"
trap 'rm -f "$attr_body"' EXIT
attr_status="$(curl -sS -L -o "$attr_body" -w '%{http_code}' "$ORIGIN/attribution/anatomy" 2>/dev/null || true)"
[ "$attr_status" = 200 ] && ok "attribution page → 200" || bad "attribution page not 200 ($attr_status)"
if grep -q 'BodyParts3D' "$attr_body" \
  && grep -q 'Database Center for Life Science' "$attr_body" \
  && grep -q 'CC Attribution 4.0 International' "$attr_body"; then
  ok "attribution page contains the BodyParts3D credit line"
else
  bad "attribution page missing the BodyParts3D credit line"
fi

# The unauthenticated web home intentionally redirects to /login; follow it so
# the check proves the final page renders rather than asserting the redirect.
home_status="$(curl -sS -L -o /dev/null -w '%{http_code}' "$ORIGIN/" 2>/dev/null || true)"
[ "$home_status" = 200 ] && ok "web home → 200 (after auth redirect)" || bad "web home not 200 ($home_status)"

echo "10) API port is not published to the internet"
# The API must only be reachable through nginx/TLS. docker-compose.prod.yml
# publishes it on 127.0.0.1:4000, so a connection to <api-host>:4000 from
# outside the host must be refused. Derive the hostname from the public API URL
# and probe the bare port; any HTTP response means the container port leaked.
case "$API" in
  https://*)
    api_authority="${API#https://}"
    api_host="${api_authority%%/*}"
    api_host="${api_host%%:*}"
    if curl -s -o /dev/null --connect-timeout 3 "http://$api_host:4000/api/v1/health" 2>/dev/null; then
      bad "API port 4000 is reachable from the internet on $api_host"
    else
      ok "API port 4000 is not externally reachable on $api_host"
    fi
    ;;
  *)
    echo "  ⏭  skipped (API is not https; cannot distinguish local from external)"
    ;;
esac

echo
echo "──────────────────────────────"
echo "  PASS: $pass    FAIL: $fail"
echo "──────────────────────────────"
[ "$fail" -eq 0 ]
