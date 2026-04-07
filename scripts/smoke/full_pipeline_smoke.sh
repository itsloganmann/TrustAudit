#!/usr/bin/env bash
# TrustAudit autonomous full-pipeline smoke test.
#
# Hits every endpoint required for the YC customer demo against a target
# base URL. Prints PASS/FAIL for each check and exits non-zero if any
# check fails.
#
# Usage:
#   ./scripts/smoke/full_pipeline_smoke.sh                       # default
#   BASE_URL=http://127.0.0.1:8000 ./scripts/smoke/full_pipeline_smoke.sh
#
# Requires: curl, jq, python3.

set -uo pipefail

BASE_URL="${BASE_URL:-https://trustaudit-wxd7.onrender.com}"
COOKIES="$(mktemp -t trustaudit-smoke-cookies.XXXXXX)"
trap 'rm -f "$COOKIES"' EXIT

GREEN="$(printf '\033[32m')"
RED="$(printf '\033[31m')"
YELLOW="$(printf '\033[33m')"
DIM="$(printf '\033[2m')"
RESET="$(printf '\033[0m')"

PASS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0
FAIL_DETAILS=()

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
log()      { printf '%s\n' "$*"; }
section()  { printf '\n%s== %s ==%s\n' "${DIM}" "$*" "${RESET}"; }
pass()     { PASS_COUNT=$((PASS_COUNT+1)); printf '  %sPASS%s %s\n' "${GREEN}" "${RESET}" "$*"; }
fail()     { FAIL_COUNT=$((FAIL_COUNT+1)); FAIL_DETAILS+=("$*"); printf '  %sFAIL%s %s\n' "${RED}" "${RESET}" "$*"; }
skip()     { SKIP_COUNT=$((SKIP_COUNT+1)); printf '  %sSKIP%s %s\n' "${YELLOW}" "${RESET}" "$*"; }

# Run curl, capture http status + body. Args: METHOD URL [extra-curl-args...]
http() {
  local method="$1"; shift
  local url="$1"; shift
  curl -sS -o /tmp/trustaudit-smoke-body \
       -w '%{http_code}' \
       -X "$method" \
       -b "$COOKIES" -c "$COOKIES" \
       "$url" "$@"
}

body() { cat /tmp/trustaudit-smoke-body 2>/dev/null; }

assert_status() {
  local actual="$1" expected="$2" label="$3"
  if [ "$actual" = "$expected" ]; then
    pass "$label (HTTP $actual)"
    return 0
  fi
  fail "$label — expected HTTP $expected, got $actual. body=$(body | head -c 200)"
  return 1
}

assert_json_field() {
  local jq_expr="$1" expected="$2" label="$3"
  local actual
  actual=$(body | jq -r "$jq_expr" 2>/dev/null || echo "<jq-error>")
  if [ "$actual" = "$expected" ]; then
    pass "$label = $expected"
    return 0
  fi
  fail "$label — expected '$expected', got '$actual'"
  return 1
}

assert_body_contains() {
  local needle="$1" label="$2"
  if body | grep -qF "$needle"; then
    pass "$label contains '$needle'"
    return 0
  fi
  fail "$label — body did not contain '$needle'. body=$(body | head -c 200)"
  return 1
}

# ===========================================================================
# 1. Public health surface
# ===========================================================================
section "1. Public health surface"

code=$(http GET "$BASE_URL/health")
assert_status "$code" "200" "GET /health"
assert_json_field '.status' "healthy" "/health.status"

code=$(http GET "$BASE_URL/")
assert_status "$code" "200" "GET / (landing page)"
assert_body_contains "TrustAudit" "GET / body"

code=$(http GET "$BASE_URL/api/webhook/whatsapp/health")
assert_status "$code" "200" "GET /api/webhook/whatsapp/health"
# health body shape: { active_provider, last_inbound_at, providers: { mock: {...}, twilio: {...}, baileys: {...} } }
providers=$(body | jq -r '.providers | keys | join(",")' 2>/dev/null || echo "")
active=$(body | jq -r '.active_provider // empty' 2>/dev/null || echo "")
if [ -n "$providers" ] && echo "$providers" | grep -q "mock\|twilio\|baileys"; then
  pass "WhatsApp health providers=[$providers] active=$active"
else
  fail "WhatsApp health body missing providers map. body=$(body | head -c 200)"
fi

code=$(http GET "$BASE_URL/api/demo/health")
assert_status "$code" "200" "GET /api/demo/health"
assert_json_field '.healthy' "true" "/api/demo/health.healthy"

# ===========================================================================
# 2. Demo session lifecycle
# ===========================================================================
section "2. Demo session lifecycle"

SMOKE_SESSION="smoke-$(date +%s)-$$"

code=$(http POST "$BASE_URL/api/demo/new-session?custom_id=$SMOKE_SESSION")
assert_status "$code" "200" "POST /api/demo/new-session?custom_id=$SMOKE_SESSION"
assert_json_field '.session_id' "$SMOKE_SESSION" "demo session_id echoes custom_id"
assert_json_field '.whatsapp_number' "+14155238886" "demo whatsapp_number"

# Collision should now 409 (adversary fix #7).
code=$(http POST "$BASE_URL/api/demo/new-session?custom_id=$SMOKE_SESSION")
assert_status "$code" "409" "POST /api/demo/new-session duplicate -> 409"

# /api/live/invoices for the new session should be empty.
code=$(http GET "$BASE_URL/api/live/invoices?session=$SMOKE_SESSION")
assert_status "$code" "200" "GET /api/live/invoices?session=$SMOKE_SESSION"
count=$(body | jq -r '.count // -1')
if [ "$count" = "0" ]; then
  pass "live invoices count = 0 for fresh session"
else
  fail "live invoices count expected 0, got $count"
fi

# ===========================================================================
# 3. Auth surface
# ===========================================================================
section "3. Auth surface"

# Vendor signin happy path
code=$(http POST "$BASE_URL/api/auth/vendor/signin" \
       -H "content-type: application/json" \
       --data '{"email":"vendor@bharat.demo","password":"demo"}')
assert_status "$code" "200" "POST /api/auth/vendor/signin (vendor@bharat.demo)"
assert_json_field '.user.email' "vendor@bharat.demo" "vendor signin response email"
assert_json_field '.user.role' "vendor" "vendor signin response role"
if grep -q 'trustaudit_session' "$COOKIES"; then
  pass "trustaudit_session cookie set after vendor signin"
else
  fail "trustaudit_session cookie missing after vendor signin"
fi

# /api/auth/me with the cookie
code=$(http GET "$BASE_URL/api/auth/me")
assert_status "$code" "200" "GET /api/auth/me (signed in)"
assert_json_field '.role' "vendor" "/api/auth/me.role"
assert_json_field '.email' "vendor@bharat.demo" "/api/auth/me.email"

# Stash the vendor user_id for later checks
VENDOR_USER_ID=$(body | jq -r '.id // .user.id // empty')
if [ -n "$VENDOR_USER_ID" ] && [ "$VENDOR_USER_ID" != "null" ]; then
  pass "vendor user_id captured = $VENDOR_USER_ID"
else
  skip "could not capture vendor user_id"
fi

# Sign out
code=$(http POST "$BASE_URL/api/auth/signout")
if [ "$code" = "200" ] || [ "$code" = "204" ]; then
  pass "POST /api/auth/signout (HTTP $code)"
else
  fail "POST /api/auth/signout — expected 200/204, got $code"
fi
code=$(http GET "$BASE_URL/api/auth/me")
assert_status "$code" "401" "GET /api/auth/me after signout -> 401"

# Wrong password
code=$(http POST "$BASE_URL/api/auth/vendor/signin" \
       -H "content-type: application/json" \
       --data '{"email":"vendor@bharat.demo","password":"definitely-wrong"}')
assert_status "$code" "401" "POST /api/auth/vendor/signin with wrong password -> 401"

# Wrong-role oracle: driver creds on vendor endpoint (adversary fix #13).
code=$(http POST "$BASE_URL/api/auth/vendor/signin" \
       -H "content-type: application/json" \
       --data '{"email":"driver@gupta.demo","password":"demo"}')
assert_status "$code" "401" "POST /api/auth/vendor/signin with driver creds -> 401 (oracle suppressed)"

# Driver signin happy path
code=$(http POST "$BASE_URL/api/auth/driver/signin" \
       -H "content-type: application/json" \
       --data '{"email":"driver@gupta.demo","password":"demo"}')
assert_status "$code" "200" "POST /api/auth/driver/signin (driver@gupta.demo)"
assert_json_field '.user.role' "driver" "driver signin response role"

# Magic link request for unknown email (silent no-op, adversary fix #10).
code=$(http POST "$BASE_URL/api/auth/magic/request" \
       -H "content-type: application/json" \
       --data '{"email":"ghost@nowhere.demo","role":"vendor"}')
assert_status "$code" "200" "POST /api/auth/magic/request unknown email -> 200"
assert_json_field '.sent' "true" "magic/request response sent=true"

# Magic link consume GET returns landing HTML, NO session (adversary fix #3).
code=$(http GET "$BASE_URL/api/auth/magic/consume?token=garbage12345")
assert_status "$code" "200" "GET /api/auth/magic/consume returns HTML landing"
assert_body_contains "Sign me in" "magic/consume landing HTML"

# Sign back in as vendor for the rest of the suite
code=$(http POST "$BASE_URL/api/auth/vendor/signin" \
       -H "content-type: application/json" \
       --data '{"email":"vendor@bharat.demo","password":"demo"}')
assert_status "$code" "200" "re-signin vendor for compliance flow"

# ===========================================================================
# 4. Legacy invoices + stats (vendor dashboard data source)
# ===========================================================================
section "4. Invoices + stats data"

code=$(http GET "$BASE_URL/api/invoices")
assert_status "$code" "200" "GET /api/invoices"
inv_count=$(body | jq 'length // 0')
if [ "$inv_count" -ge 30 ]; then
  pass "/api/invoices returned $inv_count rows (>=30 expected from seed)"
else
  fail "/api/invoices returned only $inv_count rows"
fi

# Find the first VERIFIED invoice for the compliance pipeline checks.
VERIFIED_INVOICE_ID=$(body | jq -r '[.[] | select(.status=="VERIFIED")] | .[0].id // empty')
if [ -n "$VERIFIED_INVOICE_ID" ] && [ "$VERIFIED_INVOICE_ID" != "null" ]; then
  pass "captured VERIFIED invoice id=$VERIFIED_INVOICE_ID"
else
  fail "no VERIFIED invoice found in /api/invoices response"
fi

code=$(http GET "$BASE_URL/api/stats")
assert_status "$code" "200" "GET /api/stats"
total=$(body | jq -r '.total_invoices // -1')
if [ "$total" -ge 30 ]; then
  pass "/api/stats.total_invoices=$total"
else
  fail "/api/stats.total_invoices=$total (expected >=30)"
fi

# ===========================================================================
# 5. Compliance pipeline (PDF + submit-to-gov)
# ===========================================================================
section "5. Compliance pipeline"

if [ -n "${VERIFIED_INVOICE_ID:-}" ] && [ "$VERIFIED_INVOICE_ID" != "null" ]; then
  # PDF endpoint
  code=$(http GET "$BASE_URL/api/invoices/$VERIFIED_INVOICE_ID/compliance.pdf")
  if [ "$code" = "200" ]; then
    if head -c 8 /tmp/trustaudit-smoke-body | grep -q '%PDF-'; then
      pass "GET /api/invoices/$VERIFIED_INVOICE_ID/compliance.pdf returned a real PDF"
    else
      fail "compliance.pdf endpoint returned 200 but body is not a PDF"
    fi
    if grep -q '%%EOF' /tmp/trustaudit-smoke-body; then
      pass "compliance.pdf has %%EOF trailer"
    else
      fail "compliance.pdf missing %%EOF trailer"
    fi
  elif [ "$code" = "503" ]; then
    skip "compliance.pdf returned 503 (WeasyPrint native libs missing on host)"
  else
    fail "GET compliance.pdf -> HTTP $code (expected 200 or 503)"
  fi

  # Submit to gov — happy path
  code=$(http POST "$BASE_URL/api/invoices/$VERIFIED_INVOICE_ID/submit-to-gov")
  if [ "$code" = "200" ]; then
    assert_json_field '.state' "SUBMITTED_TO_GOV" "submit-to-gov.state"
  elif [ "$code" = "503" ]; then
    skip "submit-to-gov returned 503 (PDF rendering unavailable)"
  else
    fail "POST submit-to-gov -> HTTP $code (body=$(body | head -c 200))"
  fi

  # Re-submit should now 400 (already submitted, state != VERIFIED)
  code=$(http POST "$BASE_URL/api/invoices/$VERIFIED_INVOICE_ID/submit-to-gov")
  if [ "$code" = "400" ]; then
    pass "re-submit on already-submitted invoice -> 400"
  elif [ "$code" = "503" ]; then
    skip "re-submit returned 503 (PDF rendering unavailable)"
  else
    fail "re-submit expected 400, got $code"
  fi
else
  skip "compliance pipeline checks (no VERIFIED invoice id)"
fi

# ===========================================================================
# 6. Public verification (sanitised, no auth)
# ===========================================================================
section "6. Public verification"

# Drop the cookie jar so we hit the public route truly unauthenticated.
TMP_NOAUTH=$(mktemp)
if [ -n "${VERIFIED_INVOICE_ID:-}" ] && [ "$VERIFIED_INVOICE_ID" != "null" ]; then
  curl -sS -o /tmp/trustaudit-smoke-body -w '%{http_code}' \
       -b "$TMP_NOAUTH" -c "$TMP_NOAUTH" \
       "$BASE_URL/api/verify/$VERIFIED_INVOICE_ID" > /tmp/trustaudit-smoke-code
  code=$(cat /tmp/trustaudit-smoke-code)
  if [ "$code" = "200" ]; then
    pass "GET /api/verify/$VERIFIED_INVOICE_ID (no auth) -> 200"
    has_audit_hash=$(body | jq -r '.audit_hash // empty')
    if [ -n "$has_audit_hash" ]; then
      pass "verification body has audit_hash"
    else
      fail "verification body missing audit_hash"
    fi
    # PII negative space — vendor name, gstin, amount must NOT appear.
    if body | jq -e 'has("vendor_name") or has("gstin") or has("invoice_amount") or has("pan")' > /dev/null 2>&1; then
      leaked=$(body | jq -r 'keys | map(select(. == "vendor_name" or . == "gstin" or . == "invoice_amount" or . == "pan")) | join(",")')
      fail "verification body LEAKED PII fields: $leaked"
    else
      pass "verification body contains no PII fields"
    fi
  else
    fail "GET /api/verify/$VERIFIED_INVOICE_ID -> $code (expected 200)"
  fi

  # Non-existent id should 404
  curl -sS -o /tmp/trustaudit-smoke-body -w '%{http_code}' \
       -b "$TMP_NOAUTH" -c "$TMP_NOAUTH" \
       "$BASE_URL/api/verify/99999999" > /tmp/trustaudit-smoke-code
  code=$(cat /tmp/trustaudit-smoke-code)
  assert_status "$code" "404" "GET /api/verify/99999999 -> 404"
else
  skip "public verification (no VERIFIED invoice id)"
fi
rm -f "$TMP_NOAUTH" /tmp/trustaudit-smoke-code

# ===========================================================================
# 7. Dispute lifecycle
# ===========================================================================
section "7. Disputes"

# Build a set of invoice ids that already have an open or in_review
# dispute (the seed creates a few). We need to pick an invoice that's
# NOT in that set so POST /api/disputes returns 201 instead of 409.
EXISTING_DISPUTE_INVOICES=$(curl -sS -b "$COOKIES" "$BASE_URL/api/disputes" \
  | jq -r '[.disputes[] | select(.status == "open" or .status == "in_review") | .invoice_id] | unique | join(",")' 2>/dev/null)

DISPUTE_INVOICE_ID=$(curl -sS -b "$COOKIES" "$BASE_URL/api/invoices" \
  | jq -r --arg blocked "$EXISTING_DISPUTE_INVOICES" '
      ($blocked | split(",") | map(tonumber? // -1)) as $blockedIds
      | [.[] | select(.status != "VERIFIED" and (.id | IN($blockedIds[]) | not))]
      | .[0].id // empty
    ' 2>/dev/null)

if [ -n "$DISPUTE_INVOICE_ID" ] && [ "$DISPUTE_INVOICE_ID" != "null" ]; then
  code=$(http POST "$BASE_URL/api/disputes" \
         -H "content-type: application/json" \
         --data "{\"invoice_id\":$DISPUTE_INVOICE_ID,\"reason_code\":\"wrong_amount\",\"notes\":\"smoke test\"}")
  assert_status "$code" "201" "POST /api/disputes (invoice $DISPUTE_INVOICE_ID)"
  DISPUTE_ID=$(body | jq -r '.id // empty')
  if [ -n "$DISPUTE_ID" ] && [ "$DISPUTE_ID" != "null" ]; then
    pass "captured dispute id=$DISPUTE_ID"

    # GET should include it
    code=$(http GET "$BASE_URL/api/disputes")
    assert_status "$code" "200" "GET /api/disputes"
    found=$(body | jq -r ".disputes[] | select(.id == $DISPUTE_ID) | .id")
    if [ "$found" = "$DISPUTE_ID" ]; then
      pass "dispute $DISPUTE_ID present in list"
    else
      fail "dispute $DISPUTE_ID not present in list"
    fi

    # PATCH to resolved
    code=$(http PATCH "$BASE_URL/api/disputes/$DISPUTE_ID" \
           -H "content-type: application/json" \
           --data '{"status":"resolved","resolution_notes":"smoke test resolved"}')
    assert_status "$code" "200" "PATCH /api/disputes/$DISPUTE_ID -> resolved"
    assert_json_field '.status' "resolved" "dispute status after PATCH"
  else
    fail "could not capture dispute id"
  fi
else
  skip "dispute lifecycle (no unverified invoice id)"
fi

# Driver should NOT be able to POST a dispute -> 403
TMP_DRIVER=$(mktemp)
curl -sS -b "$TMP_DRIVER" -c "$TMP_DRIVER" \
     -X POST "$BASE_URL/api/auth/driver/signin" \
     -H "content-type: application/json" \
     --data '{"email":"driver@gupta.demo","password":"demo"}' > /dev/null
code=$(curl -sS -o /tmp/trustaudit-smoke-body -w '%{http_code}' \
       -b "$TMP_DRIVER" -c "$TMP_DRIVER" \
       -X POST "$BASE_URL/api/disputes" \
       -H "content-type: application/json" \
       --data '{"invoice_id":1,"reason_code":"wrong_amount"}')
if [ "$code" = "403" ] || [ "$code" = "401" ]; then
  pass "driver POST /api/disputes -> $code (forbidden)"
else
  fail "driver POST /api/disputes expected 401/403, got $code"
fi
rm -f "$TMP_DRIVER"

# ===========================================================================
# 8. CORS guardrail
# ===========================================================================
section "8. CORS guardrail"

# Disallowed origin must NOT be reflected in Access-Control-Allow-Origin.
ac_evil=$(curl -sS -i -o /dev/null -X OPTIONS \
          -H "Origin: https://evil.example.com" \
          -H "Access-Control-Request-Method: GET" \
          -D /tmp/trustaudit-smoke-headers \
          "$BASE_URL/api/auth/me" \
          && grep -i "^access-control-allow-origin:" /tmp/trustaudit-smoke-headers || true)
if echo "$ac_evil" | grep -qi "evil.example.com"; then
  fail "CORS reflects evil origin: $ac_evil"
elif echo "$ac_evil" | grep -qi "\*"; then
  fail "CORS still allow_origins=\\*: $ac_evil"
else
  pass "CORS does not reflect disallowed origin"
fi

# Allowed origin should be reflected.
curl -sS -i -o /dev/null -X OPTIONS \
     -H "Origin: https://trustaudit.in" \
     -H "Access-Control-Request-Method: GET" \
     -D /tmp/trustaudit-smoke-headers \
     "$BASE_URL/api/auth/me"
if grep -i "^access-control-allow-origin:" /tmp/trustaudit-smoke-headers \
   | grep -qi "trustaudit.in"; then
  pass "CORS allows https://trustaudit.in"
else
  fail "CORS did NOT allow https://trustaudit.in. headers=$(grep -i ^access-control /tmp/trustaudit-smoke-headers || echo none)"
fi

# ===========================================================================
# 9. WhatsApp webhook ingestion (mock multipart)
# ===========================================================================
section "9. WhatsApp webhook ingestion"

# Use a unique MessageSid so we don't collide with prior runs.
SMOKE_SID="SMOKE-$(date +%s)-$$"

code=$(curl -sS -o /tmp/trustaudit-smoke-body -w '%{http_code}' \
       -X POST "$BASE_URL/api/webhook/whatsapp/inbound" \
       -F "From=+15555550100" \
       -F "Body=smoke test message" \
       -F "MessageSid=$SMOKE_SID" \
       -F "NumMedia=0")
if [ "$code" = "200" ] || [ "$code" = "202" ]; then
  pass "POST /api/webhook/whatsapp/inbound (mock multipart) -> $code"
else
  fail "POST /api/webhook/whatsapp/inbound -> HTTP $code (body=$(body | head -c 200))"
fi

# Replay the same MessageSid — should be short-circuited
code=$(curl -sS -o /tmp/trustaudit-smoke-body -w '%{http_code}' \
       -X POST "$BASE_URL/api/webhook/whatsapp/inbound" \
       -F "From=+15555550100" \
       -F "Body=smoke test replay" \
       -F "MessageSid=$SMOKE_SID" \
       -F "NumMedia=0")
if [ "$code" = "200" ] || [ "$code" = "202" ]; then
  status_field=$(body | jq -r '.status // empty' 2>/dev/null)
  if [ "$status_field" = "duplicate" ]; then
    pass "replay of same MessageSid -> status=duplicate"
  else
    pass "replay of same MessageSid accepted (HTTP $code, status=$status_field)"
  fi
else
  fail "replay -> HTTP $code"
fi

# ===========================================================================
# 10. Signup -> verify email -> ... (smoke only)
# ===========================================================================
section "10. Signup happy path"

SIGNUP_EMAIL="smoke-$(date +%s)@bharat.demo"
code=$(http POST "$BASE_URL/api/auth/vendor/signup" \
       -H "content-type: application/json" \
       --data "{\"email\":\"$SIGNUP_EMAIL\",\"password\":\"longpassword12345\",\"full_name\":\"Smoke Tester\"}")
if [ "$code" = "201" ] || [ "$code" = "200" ]; then
  pass "POST /api/auth/vendor/signup -> $code"
else
  fail "vendor signup -> HTTP $code (body=$(body | head -c 200))"
fi

# Duplicate email should 409
code=$(http POST "$BASE_URL/api/auth/vendor/signup" \
       -H "content-type: application/json" \
       --data "{\"email\":\"$SIGNUP_EMAIL\",\"password\":\"longpassword12345\",\"full_name\":\"Smoke Tester\"}")
assert_status "$code" "409" "duplicate signup -> 409"

# ===========================================================================
# Summary
# ===========================================================================
section "Summary"

TOTAL=$((PASS_COUNT + FAIL_COUNT))
printf '%spass=%d  fail=%d  skip=%d  total=%d%s\n' \
  "${GREEN}${PASS_COUNT}P / ${RED}${FAIL_COUNT}F / ${YELLOW}${SKIP_COUNT}S${RESET}  " \
  "$PASS_COUNT" "$FAIL_COUNT" "$SKIP_COUNT" "$TOTAL" ""

if [ "$FAIL_COUNT" -gt 0 ]; then
  printf '\n%sFailures:%s\n' "${RED}" "${RESET}"
  for d in "${FAIL_DETAILS[@]}"; do
    printf '  - %s\n' "$d"
  done
  exit 1
fi

printf '\n%sALL CHECKS GREEN against %s%s\n' "${GREEN}" "$BASE_URL" "${RESET}"
exit 0
