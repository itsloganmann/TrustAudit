#!/usr/bin/env bash
# One-shot installer that:
#   1. Verifies pm2 is on PATH (installs globally via npm if missing)
#   2. Installs the ~/.zshrc.d/claude-pm2.zsh hook so every `claude`
#      invocation is tracked in pm2's metadata store
#   3. Patches ~/.zshrc to source the hook directory
#   4. Creates the .fleet/log directory the ecosystem expects
#   5. Prints the sudo command for launchd boot persistence (must be
#      run by Logan himself — pm2 startup launchd needs sudo)
#
# Idempotent. Safe to re-run.

set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"

echo "==> Verifying pm2"
if ! command -v pm2 >/dev/null 2>&1; then
  echo "    pm2 not on PATH, installing globally via npm..."
  if ! command -v npm >/dev/null 2>&1; then
    echo "    npm is required. Install Node.js (e.g. via nvm) first." >&2
    exit 1
  fi
  npm install -g pm2
fi
echo "    pm2 $(pm2 -v) at $(which pm2)"

echo "==> Installing shell hook"
mkdir -p "${HOME}/.zshrc.d"
HOOK_TARGET="${HOME}/.zshrc.d/claude-pm2.zsh"
if [[ ! -f "${HOOK_TARGET}" ]]; then
  echo "    expected hook file at ${HOOK_TARGET}" >&2
  echo "    (it should have been written by the installer commit; aborting)" >&2
  exit 1
fi

ZSHRC="${HOME}/.zshrc"
if ! grep -q "zshrc.d" "${ZSHRC}" 2>/dev/null; then
  echo "    patching ${ZSHRC} to source ~/.zshrc.d/*.zsh"
  cat >> "${ZSHRC}" <<'PATCH'

# Auto-source ~/.zshrc.d/*.zsh — installed by TrustAudit fleet installer.
# Includes the pm2 wrapper that tracks every Claude Code invocation.
if [[ -d "${HOME}/.zshrc.d" ]]; then
  for __zshrcd_f in "${HOME}/.zshrc.d/"*.zsh(N); do
    source "${__zshrcd_f}"
  done
  unset __zshrcd_f
fi
PATCH
else
  echo "    ${ZSHRC} already sources zshrc.d"
fi

echo "==> Creating .fleet/log dirs"
mkdir -p "${REPO}/.fleet/log" "${REPO}/.fleet/queue" "${REPO}/.fleet/results" "${REPO}/.fleet/heartbeat"

echo "==> Bootstrapping ecosystem (will not auto-start agents until Logan runs pm2 start)"
pm2 list >/dev/null 2>&1 || true
echo "    next step: cd ${REPO} && pm2 start ecosystem.config.cjs"

echo
echo "==> launchd boot persistence (REQUIRES SUDO — Logan must run this)"
echo
PM2_PATH="$(which pm2)"
NODE_BIN="$(dirname "$(which node)")"
echo "    sudo env PATH=\$PATH:${NODE_BIN} ${PM2_PATH} startup launchd -u $(whoami) --hp ${HOME}"
echo
echo "    After running the sudo command above, run:"
echo "      pm2 save"
echo "    so the saved process list survives reboot."
echo
echo "==> Done. Reload your shell with: source ~/.zshrc"
