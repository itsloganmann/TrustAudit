#!/usr/bin/env bash
# Run a single fleet agent in headless `claude -p` mode against its
# role's task queue. Invoked by pm2 via ecosystem.config.cjs.
#
# Args:
#   $1  fleet role (m1 | a1 | w1..w8)
#
# Behavior:
#   1. Pulls the next pending task from .fleet/queue/<role>.jsonl
#   2. Hands the task to `claude -p --model opus` with the agent's
#      partition + task description as the prompt body
#   3. Writes the result to .fleet/results/<role>-<timestamp>.json
#   4. Exits 0 on success, non-zero on failure (pm2 will NOT restart;
#      the manager re-enqueues stale work)
#
# This script is a placeholder until W11 ships the full headless
# fleet runner. Until then it idles for 60s and exits 0 so the pm2
# slot exists in `pm2 list` for visibility.

set -euo pipefail

ROLE="${1:-${FLEET_ROLE:-unknown}}"
NAME="${FLEET_AGENT_NAME:-fleet-${ROLE}}"
REPO="${TRUSTAUDIT_REPO:-$(cd "$(dirname "$0")/../.." && pwd)}"

mkdir -p "${REPO}/.fleet/log" "${REPO}/.fleet/queue" "${REPO}/.fleet/results"
HEARTBEAT="${REPO}/.fleet/heartbeat/${ROLE}.txt"
mkdir -p "$(dirname "${HEARTBEAT}")"

echo "[fleet] starting ${NAME} (role=${ROLE}) at $(date -u +%FT%TZ)"

# Touch heartbeat so the manager knows we're alive.
date -u +%FT%TZ > "${HEARTBEAT}"

# TODO (W11): consume tasks from .fleet/queue/${ROLE}.jsonl,
# call `claude -p --model opus` with the task body, write the result.
# For now, idle so the pm2 slot exists and the manager can see liveness.
sleep 60

echo "[fleet] ${NAME} idle cycle complete"
exit 0
