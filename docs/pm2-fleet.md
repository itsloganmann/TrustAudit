# pm2 fleet — TrustAudit + Claude Code session tracking

This repo runs every long-lived process under `pm2` so Logan has a
single source of truth for what's alive on his MacBook. The standing
rule (persisted in his global Claude memory) is **every Claude Code
session, on any repo, in any folder, forever, must be tracked by pm2**.

## Quick reference

```bash
# Install + boot persistence (one-time)
bash scripts/fleet/install-pm2.sh

# Bring up backend + frontend (no agents yet)
pm2 start ecosystem.config.cjs --only trustaudit-backend,trustaudit-frontend

# Bring up everything (services + 10 agent slots)
pm2 start ecosystem.config.cjs

# See what's running
pm2 list

# Tail logs
pm2 logs trustaudit-backend --lines 50

# Tear it all down
pm2 stop all && pm2 delete all

# Persist for reboot (run after every meaningful change)
pm2 save
```

## Apps in `ecosystem.config.cjs`

| Slot | What | Restarts |
|---|---|---|
| `trustaudit-backend` | uvicorn FastAPI on 127.0.0.1:8000 with reload | yes (max 20) |
| `trustaudit-frontend` | Vite dev server on 127.0.0.1:5173 | yes (max 10) |
| `fleet-manager` | Manager agent (m1) — task queue + merge gate | no |
| `fleet-adversary` | Adversary agent (a1) — security review of every PR | no |
| `fleet-worker-1..8` | Eight parallel workers (w1..w8) | no |

The agent slots run `scripts/fleet/run-agent.sh <role>`, which is
currently a placeholder that idles for 60s and exits. The full headless
runner (consume `.fleet/queue/<role>.jsonl`, call `claude -p --model
opus`, write results to `.fleet/results/`) lands in W11 post-demo. The
slots are registered in `pm2 list` today so visibility is correct.

## Boot persistence (one-time, requires sudo)

```bash
sudo env PATH=$PATH:/Users/logan/.nvm/versions/node/v22.20.0/bin \
  /Users/logan/.nvm/versions/node/v22.20.0/bin/pm2 \
  startup launchd -u logan --hp /Users/logan
pm2 save
```

The first command registers a launchd plist; the second persists the
current process list so it auto-loads on boot.

## Forced tracking of every Claude Code session

`~/.zshrc.d/claude-pm2.zsh` defines a `claude` shell function that:

1. Resolves the real `claude` binary on PATH (skipping itself).
2. Writes the invocation to pm2's KV metadata store
   (`pm2 set claude:last_invoked:<id> <ts> cwd=<pwd> args=...`).
3. `exec`s the real binary with the original argv. **The TTY stays
   attached**, so interactive Claude Code is unaffected — the user
   gets the normal experience, but every session is logged in pm2.

It also defines two helpers:

- `cc-spawn <name> -- <claude-args...>` — fire-and-forget headless
  task. Wraps `claude -p ...` in `pm2 start --no-autorestart`.
  Logs are tailable with `pm2 logs cc-<name> --raw`.
- `cc-status` — prints `pm2 list` plus the last claude invocation
  metadata.

## Inspecting tracked sessions

```bash
# All known invocations (shows the most recent ts + cwd):
pm2 get claude:last_invoked_at
pm2 get claude:last_invoked_cwd

# Listed in pm2's metadata store:
pm2 conf | grep '^claude:'
```

## Adding a new app to the ecosystem

Edit `ecosystem.config.cjs`, add an app entry, then:

```bash
pm2 reload ecosystem.config.cjs
pm2 save
```

`pm2 reload` is preferred over `pm2 restart` because it does a
zero-downtime swap when possible.

## Troubleshooting

- **`pm2 list` is empty after reboot** — you forgot to `pm2 save` after
  starting the apps. Re-start them and `pm2 save`.
- **`claude` says "real binary not found in PATH"** — your PATH lost
  the node bin dir. Verify with `which -a claude` after running
  `nvm use 22`. Restart your shell.
- **Backend slot keeps restarting** — tail `pm2 logs trustaudit-backend
  --lines 100`. Likely missing env vars or a port conflict.
