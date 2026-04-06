/**
 * pm2 ecosystem for the TrustAudit 10-agent fleet.
 *
 * Lifecycle:
 *   pm2 start ecosystem.config.cjs            # bring everything up
 *   pm2 list                                  # see status
 *   pm2 logs trustaudit-backend --lines 50    # tail one app
 *   pm2 restart trustaudit-backend            # restart one app
 *   pm2 stop all && pm2 delete all            # tear it all down
 *   pm2 save                                  # persist for reboot
 *
 * Requires pm2 startup launchd to have been registered:
 *   sudo env PATH=$PATH:/Users/logan/.nvm/versions/node/v22.20.0/bin \
 *     /Users/logan/.nvm/versions/node/v22.20.0/lib/node_modules/pm2/bin/pm2 \
 *     startup launchd -u logan --hp /Users/logan
 *
 * The "agent" entries are placeholder slots — the worker scripts spawn
 * Claude Code in headless `claude -p` mode against the .fleet/ task
 * queue. They DO NOT auto-restart (so they don't infinite-loop on a
 * task that consistently fails); the manager re-enqueues failed work.
 */

const path = require("path");
const repo = path.resolve(__dirname);

const env = {
  TRUSTAUDIT_REPO: repo,
  APP_ENV: "development",
  DYLD_FALLBACK_LIBRARY_PATH: "/opt/homebrew/lib",
  WHATSAPP_PROVIDER: "mock",
  VISION_PROVIDER: "gemini",
};

const runnableServices = [
  {
    name: "trustaudit-backend",
    cwd: repo,
    script: "backend/venv/bin/uvicorn",
    args: "app.main:app --host 127.0.0.1 --port 8000 --reload",
    interpreter: "none",
    env: { ...env, PYTHONPATH: path.join(repo, "backend") },
    out_file: path.join(repo, ".fleet/log/backend.out.log"),
    error_file: path.join(repo, ".fleet/log/backend.err.log"),
    merge_logs: true,
    autorestart: true,
    max_restarts: 20,
    min_uptime: 5000,
  },
  {
    name: "trustaudit-frontend",
    cwd: path.join(repo, "frontend"),
    script: "npm",
    args: "run dev -- --port 5173 --host 127.0.0.1",
    interpreter: "none",
    env: { ...env, BROWSER: "none" },
    out_file: path.join(repo, ".fleet/log/frontend.out.log"),
    error_file: path.join(repo, ".fleet/log/frontend.err.log"),
    merge_logs: true,
    autorestart: true,
    max_restarts: 10,
    min_uptime: 5000,
  },
];

// 10-agent fleet — eight workers + one manager + one adversary.
// All run in headless `claude -p` mode against task scripts the
// fleet manager publishes into .fleet/queue/<role>.jsonl. The worker
// shell scripts will be added by W11 (post-demo); for now we register
// the slots in pm2 with `autostart: false` so `pm2 list` shows them
// but they don't try to spawn until the queue scripts exist.
const agentSlots = [
  { name: "fleet-manager", role: "m1" },
  { name: "fleet-adversary", role: "a1" },
  { name: "fleet-worker-1", role: "w1" },
  { name: "fleet-worker-2", role: "w2" },
  { name: "fleet-worker-3", role: "w3" },
  { name: "fleet-worker-4", role: "w4" },
  { name: "fleet-worker-5", role: "w5" },
  { name: "fleet-worker-6", role: "w6" },
  { name: "fleet-worker-7", role: "w7" },
  { name: "fleet-worker-8", role: "w8" },
];

const agentApps = agentSlots.map(({ name, role }) => ({
  name,
  cwd: repo,
  script: path.join(repo, "scripts/fleet/run-agent.sh"),
  args: role,
  interpreter: "bash",
  env: { ...env, FLEET_ROLE: role, FLEET_AGENT_NAME: name },
  out_file: path.join(repo, `.fleet/log/${name}.out.log`),
  error_file: path.join(repo, `.fleet/log/${name}.err.log`),
  merge_logs: true,
  autorestart: false, // manager re-enqueues failed work; do not infinite-loop
  max_restarts: 5,
  min_uptime: 30000,
}));

module.exports = {
  apps: [...runnableServices, ...agentApps],
};
