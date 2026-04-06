# CI / CD and Automated Code Review

This repo ships with a full GitHub Actions pipeline plus integrations for
Cursor BugBot and GitHub Copilot review. This document explains what runs,
when, and how to enable the bots.

## Workflows (under `.github/workflows/`)

| Workflow | Triggers | What it does |
|---|---|---|
| `ci.yml` | push (main, feat/\*, fix/\*), pull_request | Backend pytest, frontend build + lint, Playwright e2e smoke |
| `security.yml` | push, pull_request, weekly Monday 09:00 UTC | CodeQL (python + js/ts), Bandit, pip-audit, npm audit, gitleaks |
| `deploy.yml` | push to main, manual dispatch | Calls Render deploy hook, waits for `/health`, post-deploy smoke |

All three are concurrency-grouped so a fresh push cancels in-flight runs on
the same ref.

## Required GitHub repository secrets

Set under **Settings → Secrets and variables → Actions**:

| Secret | Purpose | Required by |
|---|---|---|
| `RENDER_DEPLOY_HOOK_URL` | Triggers a fresh Render deploy on push to main | `deploy.yml` |
| `GITHUB_TOKEN` | Auto-provided by Actions; gitleaks uses it for PR comments | `security.yml` |

Optional secrets — only set if you actually wire up the corresponding bot:

| Secret | Used by |
|---|---|
| `CURSOR_BUGBOT_TOKEN` | Cursor BugBot (set by Cursor when you install the GitHub App) |
| `OPENAI_API_KEY` | Used by some optional review bots if added later |

## Dependabot

`.github/dependabot.yml` opens weekly PRs grouping minor + patch updates for:

- `pip` (backend)
- `npm` (frontend, e2e)
- `github-actions`
- `docker` (Dockerfile base images)

Major version bumps land in their own PRs so reviewers can vet the changelog.

## CODEOWNERS

`.github/CODEOWNERS` auto-requests review from `@logandmann` on every PR,
with stricter ownership rules on `/backend/app/auth/`, `/backend/app/services/whatsapp/`,
`/render.yaml`, and `/Dockerfile`.

---

## Cursor BugBot

[Cursor BugBot](https://docs.cursor.com/bugbot) is a GitHub App that
runs Claude / GPT-style review on every PR diff and inline-comments any
bugs, regressions, or security issues it finds.

**Enable it in 60 seconds:**

1. Visit <https://cursor.com/dashboard> and sign in with your GitHub account.
2. Open **Integrations → BugBot → Install on GitHub**.
3. Pick the `TrustAudit` repository (or "All repositories").
4. Approve the requested permissions (read code, write PR comments).

That's it — no workflow file required. BugBot starts reviewing the next PR
that opens. There is no per-month cost for personal repos at the time of
writing; if you hit a limit Cursor will surface it on the dashboard.

To **scope** BugBot (e.g., only run on PRs against `main`), edit the
settings on the Cursor dashboard, not in this repo.

## GitHub Copilot Code Review

GitHub now ships an [auto-code-review feature](https://docs.github.com/en/copilot/using-github-copilot/code-review/using-copilot-code-review)
inside Copilot. It posts inline review comments on every PR. To enable:

1. Have a Copilot Pro / Business / Enterprise seat (Logan's account already
   does).
2. Open the repo → **Settings → Code & automation → Copilot → Code review**.
3. Toggle **Automatic review on pull requests** to on.
4. Optionally restrict to specific branches (e.g., `main`).

Copilot review runs alongside Cursor BugBot; the two surface different
classes of issues (Copilot is faster on style + obvious bugs, BugBot goes
deeper on logic).

## CodeQL

CodeQL is enabled in `security.yml` and uploads results to GitHub's Security
tab. To view findings:

1. Open the repo → **Security → Code scanning alerts**.
2. Filter by severity, language, or branch.

CodeQL also runs on the weekly schedule so dormant branches still get a
scan.

## Adding more scanners

If you want to layer on additional automated review:

- **Sourcery** for refactor hints — add a job that runs `sourcery review --check` on python files.
- **Snyk** for deeper SCA — add the [Snyk Action](https://github.com/snyk/actions) and a `SNYK_TOKEN` secret.
- **TruffleHog** for additional secret scanning — replace gitleaks with `trufflesecurity/trufflehog` if you want both.
- **OSV-Scanner** — add `google/osv-scanner-action` for an OSV-DB cross-check.

All of the above can plug in without touching application code.

## Local pre-flight

Before pushing, run the same checks the CI runs:

```bash
# Backend
DYLD_FALLBACK_LIBRARY_PATH=/opt/homebrew/lib pytest backend/tests -q

# Frontend
cd frontend && npm run build && cd ..

# E2E (optional, slow)
cd e2e && npx playwright test && cd ..
```

A failing local run is a failing CI run — don't push until these are green.
