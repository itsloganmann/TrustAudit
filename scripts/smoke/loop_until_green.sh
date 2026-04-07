#!/usr/bin/env bash
# Loop driver: run the bash full-pipeline smoke and the Playwright + tesseract
# visual verifier in series, retry until both exit 0, capped at 8 attempts.
#
# Usage:
#   bash scripts/smoke/loop_until_green.sh
#
# Env (forwarded to both children):
#   BASE_URL          (default http://127.0.0.1:5173 for the visual verifier)
#   API_URL           (default http://127.0.0.1:8000 for the visual verifier)
#   SMOKE_BASE_URL    (default http://127.0.0.1:8000 for the bash smoke)
#   VENDOR_EMAIL      (default vendor@bharat.demo)
#   VENDOR_PASSWORD   (default demo)
#   MAX_ATTEMPTS      (default 8)
#   SLEEP_BETWEEN     (default 20)

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SMOKE_DIR="$REPO_ROOT/scripts/smoke"
LOG_FILE="$SMOKE_DIR/loop_until_green.log"

MAX_ATTEMPTS="${MAX_ATTEMPTS:-8}"
SLEEP_BETWEEN="${SLEEP_BETWEEN:-20}"
SMOKE_BASE_URL="${SMOKE_BASE_URL:-http://127.0.0.1:8000}"
BASE_URL="${BASE_URL:-http://127.0.0.1:5173}"
API_URL="${API_URL:-http://127.0.0.1:8000}"
VENDOR_EMAIL="${VENDOR_EMAIL:-vendor@bharat.demo}"
VENDOR_PASSWORD="${VENDOR_PASSWORD:-demo}"

export BASE_URL API_URL VENDOR_EMAIL VENDOR_PASSWORD

GREEN='\033[32m'
RED='\033[31m'
YELLOW='\033[33m'
DIM='\033[2m'
RESET='\033[0m'

log() {
  local msg="$*"
  printf '%s\n' "$msg" | tee -a "$LOG_FILE"
}

mkdir -p "$(dirname "$LOG_FILE")"
: > "$LOG_FILE"

log "${DIM}=== loop_until_green start $(date -Iseconds) ===${RESET}"
log "${DIM}MAX_ATTEMPTS=$MAX_ATTEMPTS  SLEEP_BETWEEN=${SLEEP_BETWEEN}s${RESET}"
log "${DIM}SMOKE_BASE_URL=$SMOKE_BASE_URL  BASE_URL=$BASE_URL  API_URL=$API_URL${RESET}"

attempt=1
while [ "$attempt" -le "$MAX_ATTEMPTS" ]; do
  log ""
  log "${DIM}--- attempt $attempt / $MAX_ATTEMPTS ---${RESET}"

  log "${YELLOW}[1/2] running full_pipeline_smoke.sh against $SMOKE_BASE_URL${RESET}"
  if BASE_URL="$SMOKE_BASE_URL" bash "$SMOKE_DIR/full_pipeline_smoke.sh" 2>&1 | tee -a "$LOG_FILE"; then
    smoke_rc=0
    log "${GREEN}[1/2] full_pipeline_smoke.sh PASSED${RESET}"
  else
    smoke_rc=${PIPESTATUS[0]}
    log "${RED}[1/2] full_pipeline_smoke.sh FAILED (rc=$smoke_rc)${RESET}"
  fi

  log "${YELLOW}[2/2] running visual_verify.mjs against $BASE_URL${RESET}"
  if (cd "$SMOKE_DIR" && node visual_verify.mjs) 2>&1 | tee -a "$LOG_FILE"; then
    visual_rc=0
    log "${GREEN}[2/2] visual_verify.mjs PASSED${RESET}"
  else
    visual_rc=${PIPESTATUS[0]}
    log "${RED}[2/2] visual_verify.mjs FAILED (rc=$visual_rc)${RESET}"
  fi

  if [ "$smoke_rc" = "0" ] && [ "$visual_rc" = "0" ]; then
    log ""
    log "${GREEN}=== ALL GREEN on attempt $attempt ===${RESET}"
    exit 0
  fi

  if [ "$attempt" -eq "$MAX_ATTEMPTS" ]; then
    log ""
    log "${RED}=== exhausted $MAX_ATTEMPTS attempts; smoke_rc=$smoke_rc visual_rc=$visual_rc ===${RESET}"
    exit 1
  fi

  log "${DIM}sleeping ${SLEEP_BETWEEN}s before retry...${RESET}"
  sleep "$SLEEP_BETWEEN"
  attempt=$((attempt + 1))
done
