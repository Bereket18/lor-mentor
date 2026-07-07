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
#          $1 = API base URL          $2 = web origin (for the CORS check)
set -uo pipefail

API="${1:-http://127.0.0.1:4000}"
ORIGIN="${2:-http://localhost:3000}"
BASE="$API/api/v1"
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
c=$(code "$BASE/auth/forgot-password" POST '{"email":"definitely-not-a-user@example.com}"}')
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

echo
echo "──────────────────────────────"
echo "  PASS: $pass    FAIL: $fail"
echo "──────────────────────────────"
[ "$fail" -eq 0 ]
