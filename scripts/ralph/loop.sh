#!/usr/bin/env bash
#
# Ralph Wiggum loop — TrustAudit autonomous driver.
#
# Pattern: every iteration we hand Claude Code the same fixed prompt
# (scripts/ralph/prompt.md) and let it make one bite-sized change,
# commit, push, and exit. We keep looping until:
#
#   1. scripts/ralph/STATUS contains "DONE"       -> success
#   2. the iteration counter hits MAX_ITERATIONS  -> safety cap
#   3. the user kills the process                 -> manual stop
#
# Each iteration is hard-capped at ITERATION_TIMEOUT seconds so a
# wedged Claude session cannot eat the demo window.
#
# Usage:
#   scripts/ralph/loop.sh                  # default: up to 40 iterations
#   MAX_ITERATIONS=10 scripts/ralph/loop.sh
#   ITERATION_TIMEOUT=900 scripts/ralph/loop.sh
#
# Logs are appended to scripts/ralph/loop.log for post-mortem.
# JOURNAL.md records what each iteration did, written by Claude itself.

set -euo pipefail

cd "$(dirname "$0")/../.."

RALPH_DIR="scripts/ralph"
PROMPT_FILE="$RALPH_DIR/prompt.md"
STATUS_FILE="$RALPH_DIR/STATUS"
JOURNAL_FILE="$RALPH_DIR/JOURNAL.md"
LOG_FILE="$RALPH_DIR/loop.log"

MAX_ITERATIONS="${MAX_ITERATIONS:-40}"
ITERATION_TIMEOUT="${ITERATION_TIMEOUT:-1200}"   # 20 minutes per iteration
SLEEP_BETWEEN="${SLEEP_BETWEEN:-5}"

# Ensure the scaffold files exist.
[ -f "$PROMPT_FILE" ] || { echo "missing $PROMPT_FILE" >&2; exit 2; }
touch "$JOURNAL_FILE"
: > "$STATUS_FILE"  # clear any stale DONE from a previous run

log() {
    echo "[$(date +%Y-%m-%dT%H:%M:%S%z)] $*" | tee -a "$LOG_FILE"
}

log "=========================================================="
log "Ralph Wiggum loop starting (max=$MAX_ITERATIONS, timeout=${ITERATION_TIMEOUT}s)"
log "prompt: $PROMPT_FILE"
log "status: $STATUS_FILE"
log "journal: $JOURNAL_FILE"
log "=========================================================="

# Use macOS's gtimeout if present, otherwise fall back to /usr/bin/timeout
# (Linux) or run without a timeout on systems that lack either.
TIMEOUT_BIN=""
if command -v gtimeout >/dev/null 2>&1; then
    TIMEOUT_BIN="gtimeout"
elif command -v timeout >/dev/null 2>&1; then
    TIMEOUT_BIN="timeout"
fi

for i in $(seq 1 "$MAX_ITERATIONS"); do
    log "--- iteration $i / $MAX_ITERATIONS ---"

    # Is the loop already done?
    if grep -q "DONE" "$STATUS_FILE" 2>/dev/null; then
        log "STATUS=DONE, exiting cleanly at iteration $i"
        exit 0
    fi

    # Launch Claude Code in "print" mode. --permission-mode bypassPermissions
    # gives it the same latitude as the parent session so commits + pushes
    # just work. Output goes to both the log file and stdout.
    if [ -n "$TIMEOUT_BIN" ]; then
        "$TIMEOUT_BIN" "$ITERATION_TIMEOUT" \
            claude -p \
                --permission-mode bypassPermissions \
                --add-dir /Users/logan/TrustAudit \
                < "$PROMPT_FILE" \
            2>&1 | tee -a "$LOG_FILE" || {
                rc=$?
                log "iteration $i exited non-zero (rc=$rc) — continuing"
            }
    else
        claude -p \
            --permission-mode bypassPermissions \
            --add-dir /Users/logan/TrustAudit \
            < "$PROMPT_FILE" \
            2>&1 | tee -a "$LOG_FILE" || {
                rc=$?
                log "iteration $i exited non-zero (rc=$rc) — continuing"
            }
    fi

    log "iteration $i finished"

    # Bail out early if the session wrote DONE.
    if grep -q "DONE" "$STATUS_FILE" 2>/dev/null; then
        log "STATUS=DONE after iteration $i, exiting cleanly"
        exit 0
    fi

    # Short breather so we don't hammer the API.
    sleep "$SLEEP_BETWEEN"
done

log "Hit MAX_ITERATIONS=$MAX_ITERATIONS without DONE status — stopping"
exit 1
