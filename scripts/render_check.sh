#!/usr/bin/env bash
# render_check.sh -- ping the live Render deployment and dump health.
#
# Usage:
#   ./scripts/render_check.sh                     # uses default URL
#   BASE_URL=https://other.example.com ./scripts/render_check.sh
#
# Exits 0 only if every probe returns 200.

set -euo pipefail

BASE_URL="${BASE_URL:-https://trustaudit.onrender.com}"
FAIL=0

probe() {
    local path="$1"
    local label="$2"
    local url="${BASE_URL}${path}"

    printf '%-40s ' "${label}"
    local code body
    code=$(curl -s -o /tmp/render_check.body -w '%{http_code}' --max-time 15 "${url}" || echo "000")
    body=$(head -c 200 /tmp/render_check.body 2>/dev/null || true)

    if [ "${code}" = "200" ]; then
        printf '\033[32mOK\033[0m  (%s)\n' "${code}"
    else
        printf '\033[31mFAIL\033[0m (%s) -- %s\n' "${code}" "${body}"
        FAIL=$((FAIL + 1))
    fi
}

echo "TrustAudit health probe -- ${BASE_URL}"
echo "----------------------------------------"
probe "/health"                          "/health"
probe "/api/invoices"                    "/api/invoices"
probe "/api/stats"                       "/api/stats"
probe "/api/webhook/whatsapp/health"     "/api/webhook/whatsapp/health"
probe "/api/demo/health"                 "/api/demo/health"
probe "/"                                "/ (frontend bundle)"
echo "----------------------------------------"

if [ "${FAIL}" -gt 0 ]; then
    echo "FAILED: ${FAIL} probe(s) did not return 200"
    exit 1
fi
echo "All probes OK."
