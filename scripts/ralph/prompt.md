# Ralph Wiggum loop — TrustAudit Phases I/J/K/L/M/N

You are Claude Code running inside an infinite Ralph Wiggum loop
driven by `scripts/ralph/loop.sh`. Every iteration you are handed
this exact prompt. Your job is to make one bite-sized chunk of
forward progress on the TrustAudit demo and then exit.

## Standing rules

- **Never stop until everything is green.** The loop will re-invoke
  you; do NOT try to stay resident. Do one focused thing per
  iteration.
- **Autonomous only.** Do not ask the user questions. Do not pause
  for confirmation. If you hit ambiguity, make the best call and
  write a rationale in `scripts/ralph/JOURNAL.md`.
- **Every iteration must either** commit + push a meaningful change
  OR prove that no progress is needed and exit 0.
- **Respect the plan.** The single source of truth is
  `/Users/logan/.claude/plans/snappy-twirling-mist.md`. Stay inside
  the approved phases F→N.
- **Branch:** always work on `main`. Commit messages use
  `feat:` / `fix:` / `chore:` prefixes.

## What to do each iteration

1. `git status && git log --oneline -5` to orient.
2. Read `scripts/ralph/JOURNAL.md` to see what earlier iterations
   already did.
3. Pick the highest-priority outstanding task from this list:
   - **Phase I** — SSE real-time stream (`/api/live/stream`,
     `demo_sessions.subscribe/emit`, `useSSE` hook wiring).
   - **Phase J** — `JustificationCanvas.jsx` (react-three-fiber
     scene) embedded in `InvoiceDetailSheet.jsx`, fed by
     `/api/invoices/{id}/justification`.
   - **Phase K** — extend `scripts/smoke/full_pipeline_smoke.sh`
     with sections 11-14 (annotation, justification, SSE, real
     internet receipt).
   - **Phase L** — run the smoke script against
     `https://trustaudit-wxd7.onrender.com` and fix whatever fails.
   - **Phase M** — Playwright + `tesseract.js` visual verifier
     (`scripts/smoke/visual_verify.mjs`), screenshot artifacts
     under `artifacts/visual/<timestamp>/`.
   - **Phase N** — liquid-glass UI overhaul:
     `frontend/src/index.css` utility classes + ambient 3D
     background + framer-motion on drawer/toast/buttons.
4. Make the minimum change that advances that task. Run whatever
   local verification you can (pytest, npm build, curl, Playwright).
5. `git add -p` + commit + `git push origin main`. Wait for Render
   if and only if a backend change requires live verification.
6. Append a one-line update to `scripts/ralph/JOURNAL.md`:
   `<ISO-timestamp> <short description> <commit-sha>`.
7. If every phase is already complete AND both smoke scripts pass
   twice in a row against Render, write `DONE` to
   `scripts/ralph/STATUS` and exit. The outer loop detects this
   and stops looping.

## Deliberate non-goals

- Do NOT refactor code outside the current phase.
- Do NOT change `Dockerfile` unless a deploy is broken.
- Do NOT modify auth routes, rate limits, or existing passing
  tests.
- Do NOT edit `scripts/ralph/prompt.md` itself.

## Verification that you're done

Success is defined by `/Users/logan/.claude/plans/snappy-twirling-mist.md`
section "Verification":

1. `scripts/smoke/full_pipeline_smoke.sh` exits 0 against Render,
   with sections 11-14 included.
2. `scripts/smoke/visual_verify.mjs` exits 0 with OCR assertions
   passing on the annotated image, the 3D scene overlay, and the
   public /verify page (PII negative space).
3. Both scripts run green twice in a row.

Only when all three conditions hold do you write `DONE` to
`scripts/ralph/STATUS`. Until then, every iteration must advance
one concrete step.
