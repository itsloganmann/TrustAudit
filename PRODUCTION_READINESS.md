# Production readiness — TrustAudit

> This file is the honest, unvarnished list of everything an operator must
> know before pointing real Indian MSME customers at a deployed TrustAudit
> instance. It is deliberately blunt. If a customer emails `grievance@`
> and nothing on this list is addressed, the operator is personally
> responsible — not the codebase.

## 1. Read-this-first risk: Baileys is unofficial, Meta can terminate at any time

TrustAudit's inbound WhatsApp path runs through a **[Baileys](https://github.com/WhiskeySockets/Baileys)** sidecar. Baileys is an unofficial, reverse-engineered multi-device WhatsApp Web client. It is not WhatsApp Business API. Meta Platforms, Inc. can, at its sole discretion and without notice:

- Permanently ban the paired phone number
- Throttle inbound messages until the service appears dead
- Silently flag the account as spam so replies never arrive
- Change the underlying protocol so the sidecar stops working entirely

**If the paired number goes down, the customer-facing product goes down.** There is no SLA, no support channel, and no appeal.

### What this means for a paying customer

- Do NOT promise uptime SLAs on the WhatsApp inbound channel.
- Do NOT bill on a tier that requires WhatsApp availability as a deliverable.
- DO make the web dashboard the customer's durable surface — the dashboard keeps working on SQL rows even when WhatsApp is offline.
- DO disclose this risk in the Terms of Service (already done in `frontend/src/pages/Terms.jsx` §6 "WhatsApp integration disclaimer").

### The real fix (follow-up sprint)

Migrate to **WhatsApp Business Platform** (the Meta-sanctioned API) via a Business Solution Provider (BSP). For Indian deployments:

1. **[Gupshup](https://www.gupshup.io/)** — Bengaluru-based BSP, cheapest per-message cost in India, supports all template message formats.
2. **[360dialog](https://www.360dialog.com/)** — European BSP with India operations, cleanest API, good for startups.
3. **AiSensy** — Indian BSP with a friendly onboarding flow for small shops.

Migration cost: one calendar week of engineering time + the BSP's approval process (usually 3–10 business days for an embedded-signup flow, longer if you need custom templates pre-approved). Template-message pre-approval is mandatory for notifications; only session-style replies within a 24-hour conversation window are free-text.

**Track this as a hard follow-up, not a nice-to-have.** The entire architecture of `BaileysClient` + `backend/services/whatsapp_sidecar/` is designed to be swapped behind the `WhatsAppProvider` interface — the handler code at `backend/app/routes/webhook_whatsapp.py` does not need to change when you swap the provider, only `backend/app/services/whatsapp/__init__.py::get_whatsapp_provider`.

## 2. DPDP Act 2023 — what lawyer review must cover

The repo ships with **template** legal text at `frontend/src/pages/Privacy.jsx` and `frontend/src/pages/Terms.jsx`. Neither has been reviewed by an Indian lawyer. Before onboarding a paying customer, engage a DPDP-competent Indian lawyer (not a generic IT lawyer) and ask them to review:

### Privacy policy gaps

- [ ] Data Fiduciary identity — is the registered entity a private limited, LLP, or proprietorship? The Privacy page field `LEGAL.companyLegalName` must match the CIN/LLP/GSTIN exactly.
- [ ] Registration identifier — CIN, LLP number, or firm registration number (field `LEGAL.companyRegistration`).
- [ ] Registered address — must match the MCA / ROC filing (field `LEGAL.registeredAddress`).
- [ ] Grievance Officer appointment — per **Rule 5(9) of the draft DPDP Rules**, the Grievance Officer must be named, reachable by email and phone, and must resolve complaints within the statutory timeline. Fields: `LEGAL.grievanceOfficerName`, `grievanceOfficerEmail`, `grievanceOfficerPhone`, `grievanceOfficerAddress`.
- [ ] Data Processor contracts — we share data with Google (Gemini), Render, Resend, and Meta (WhatsApp). Each of these is a Data Processor under DPDP. We MUST have a written Data Processing Agreement on file with each of them before we can lawfully disclose that the processing happens. Google's Gemini paid-tier terms, Render's DPA, and Resend's DPA are all published — download them, sign, store.
- [ ] Cross-border transfer disclosure — Render's Postgres sits in Oregon by default. The policy discloses this in §10. Lawyer must confirm this is acceptable under §16 of the DPDP Act, and that the destination country is not on the Central Government's restricted list.
- [ ] Breach notification — we commit to 72-hour notification (§9). Lawyer must confirm this matches the final DPDP Rules when notified (the draft Rules reference "without undue delay" — we are being conservative).
- [ ] Retention policy — we commit to 7-year bill retention (matching the Income Tax Act) and 30-day personal-data deletion on account closure. Lawyer must confirm this is the right balance for the specific business model.
- [ ] Children's data (§9 DPDP) — we disclaim we do not knowingly process children's data. Lawyer must confirm this holds for the actual customer onboarding flow (B2B — unlikely to receive children's data unless a customer misuses it).

### Terms of service gaps

- [ ] Limitation of liability — we cap at ₹10,000 or 12 months' fees. Lawyer must confirm this is enforceable under §23 of the Indian Contract Act (some Indian courts push back on very low caps for consumer-facing contracts).
- [ ] AI output disclaimer — §3 disclaims accuracy of AI-extracted fields. Lawyer must confirm this is sufficient given the product is being sold as a "compliance" tool (i.e. the marketing may imply reliability that the disclaimer removes).
- [ ] Indemnity — §11. Lawyer must confirm the scope is neither too narrow (protects us from nothing) nor so broad as to be unenforceable.
- [ ] Governing law + jurisdiction — `LEGAL.jurisdictionCity` defaults to Bengaluru. Choose the city where the registered entity is based and where counsel can appear.

### How to resolve the placeholders

All legal values are runtime-configurable via Vite build-time env vars. Set them in Render's dashboard (they are sync:false, so not in `render.yaml`):

```
VITE_LEGAL_COMPANY_NAME            # display name, e.g. "TrustAudit"
VITE_LEGAL_COMPANY_LEGAL_NAME      # registered entity name, e.g. "Trustaudit Technologies Pvt Ltd"
VITE_LEGAL_COMPANY_REGISTRATION    # CIN/LLP/GSTIN
VITE_LEGAL_REGISTERED_ADDRESS      # full postal address
VITE_LEGAL_JURISDICTION_CITY       # e.g. "Bengaluru"
VITE_LEGAL_PRIVACY_EMAIL           # privacy@...
VITE_LEGAL_SUPPORT_EMAIL           # support@...
VITE_LEGAL_GRIEVANCE_OFFICER_NAME  # full name
VITE_LEGAL_GRIEVANCE_OFFICER_EMAIL # grievance@...
VITE_LEGAL_GRIEVANCE_OFFICER_PHONE # +91 XXXXX XXXXX
VITE_LEGAL_GRIEVANCE_OFFICER_ADDRESS
VITE_LEGAL_PRIVACY_LAST_UPDATED    # bump when you amend
VITE_LEGAL_TERMS_LAST_UPDATED      # bump when you amend
VITE_LEGAL_HOSTING_REGION          # e.g. "United States (Render Oregon)"
VITE_LEGAL_PLANNED_HOSTING_REGION  # e.g. "India (Mumbai)"
```

The Privacy and Terms pages render a loud amber banner when any value is still a `TODO_LEGAL` default, so a misconfigured deploy surfaces the gap to the visitor immediately.

## 3. Render deployment checklist

Before hitting "deploy" for the first real customer:

### One-time Render dashboard setup

- [ ] Web service `trustaudit` on **Starter plan** ($7/mo) — done per user purchase.
- [ ] Postgres add-on `trustaudit-pg` on **Starter plan** ($7/mo, 1GB, NOT the free tier — free tier archives after 90 days).
- [ ] Persistent disk `trustaudit-data`, 1GB, mounted at `/app/data`.
- [ ] Env var `DATABASE_URL` — auto-wired from `trustaudit-pg` via `render.yaml::fromDatabase`.
- [ ] Env var `GEMINI_API_KEY` — paste from https://aistudio.google.com/app/apikey. **Verify not using free tier for production** — free-tier Gemini retains data for training. Use paid-tier API key only.
- [ ] Env var `RESEND_API_KEY` — rotate via the Resend dashboard and paste the new value directly into Render. Never commit any fragment of the key (including prefixes) to this repo.
- [ ] Env var `ADMIN_TOKEN` — `openssl rand -hex 24`. This unlocks the `/api/admin/baileys/*` endpoints. Store in 1Password or Bitwarden, never paste in Slack.
- [ ] Env var `JWT_SECRET` — `openssl rand -hex 32`. Session cookie HMAC key. Same storage rules.
- [ ] Env var `PAIRING_PHONE` — `14085959751` (no +, no spaces). Drives the Baileys pairing-code flow.
- [ ] Env var `GOOGLE_OAUTH_CLIENT_ID` — already in `render.yaml` as public value (OK, it's not a secret).
- [ ] Env var `GOOGLE_OAUTH_CLIENT_SECRET` — paste in Render dashboard (sync:false). Required for Google sign-in.
- [ ] All `VITE_LEGAL_*` env vars from §2 above — paste per lawyer's resolved values.
- [ ] Delete all `TWILIO_*` env vars from the dashboard after the code deploy lands — none of them are referenced any more.

### First deploy sequence

1. Push branch to origin, open PR, merge to main.
2. Render auto-deploys. Watch the build logs:
    - Frontend build should succeed in ~10s.
    - Sidecar `npm install` should succeed in ~30s.
    - Python `pip install` should succeed in ~90s.
    - No `python seed.py` step at build time any more (moved to start).
3. Container start:
    - `start.sh` creates `/app/data/baileys_sessions/` and `/app/data/uploads/`.
    - `alembic upgrade head` runs against the empty Postgres.
    - `seed.py` populates 50 demo rows (runs once, idempotent afterwards).
    - Sidecar spawns on port 3001, writes QR / pair code to `/app/data/baileys_sessions/current_pair_code.txt`.
    - Uvicorn binds to `$PORT`.
4. Confirm `/health` returns `{"status":"healthy"}`.
5. Confirm `/api/invoices` returns 50 rows.
6. Pair Baileys — see §4.
7. Send a challan from a **third-party phone** (not the paired number) and verify it appears at `/live` within ~20s.

## 4. Baileys pairing runbook

Render containers are headless. Use the pairing-code flow:

```bash
# Once the deploy is up and ADMIN_TOKEN is set:
curl "https://trustaudit.onrender.com/api/admin/baileys/pair-code?token=$ADMIN_TOKEN"
# → {"status":"ready","code":"ABCD-EFGH"}
```

1. Open WhatsApp on the paired phone.
2. Settings → Linked Devices → Link a Device → **Link with phone number** (not QR).
3. Enter the 8-character code within **60 seconds**.
4. Sidecar logs print `pair_success: connected`.
5. Auth state is now persisted to `/app/data/baileys_sessions/`. Future deploys (and rollbacks that don't cross the `BAILEYS_SESSIONS_DIR` env var boundary) re-use it without re-pairing.

### If pairing fails

- **Code not accepted**: the code expires after 60s. Delete `/app/data/baileys_sessions/current_pair_code.txt` via `render shell`, restart the sidecar, re-fetch a fresh code.
- **Endless QR loop in logs**: Meta is flagging the number. Wait 24 hours, try with a different paired phone.
- **"Device already linked"**: another sidecar instance is already paired. Clear the sessions dir and re-pair (you lose message history but keep your database).

### Baileys re-pair (when Meta bans the number)

Eventually Meta will ban the paired number. When they do:

1. Acquire a new clean phone number (Indian SIM preferred — cheaper calls, less friction with Meta). Do NOT reuse numbers from other WhatsApp products.
2. Delete `/app/data/baileys_sessions/` entirely via `render shell`.
3. Update `PAIRING_PHONE` in Render dashboard.
4. Redeploy, run the pairing-code flow from §4.
5. Update `frontend/src/config/whatsapp.js` with the new number (or, better, convert it to a `VITE_WHATSAPP_*` env var so re-pair is source-free — TODO).
6. Notify customers by email 24 hours in advance if possible.

Keep a **second paired phone number on hot standby** with its own sidecar running locally. When the primary is banned, you can flip DNS / env var to point at the standby in minutes instead of hours.

## 5. Data residency — Oregon → India

Render Postgres currently runs in Oregon (US). This is disclosed in the Privacy Policy §10. The DPDP Act §16 requires the Central Government to publish a list of restricted countries before this becomes a problem. As of April 2026 no such list has been published.

**Follow-up plan** — as soon as Render offers a Mumbai or Singapore region (or before onboarding a customer whose procurement team has a hard "India-only data" requirement):

1. Provision a new Postgres in the target region.
2. `pg_dump` from Oregon, `pg_restore` to the new region.
3. Update `DATABASE_URL` in Render dashboard, trigger a restart.
4. Update `LEGAL.hostingRegion` env var.
5. Update Privacy Policy `last_updated` and email all registered users 15 days in advance (§12 Privacy).

Singapore is the most realistic intermediate step — several Indian MSME procurement teams accept Singapore as "close enough to India" because of bilateral trade agreements.

## 6. Secrets rotation schedule

Put a calendar reminder every **90 days** to rotate:

- `ADMIN_TOKEN` — regenerate, update in Render, update in password manager.
- `JWT_SECRET` — regenerate. Note: rotating this invalidates all active sessions, forcing every user to re-sign-in. Plan for a low-traffic window.
- `GEMINI_API_KEY` — rotate in Google AI Studio, update in Render.
- `RESEND_API_KEY` — rotate in Resend dashboard, update in Render.
- `GOOGLE_OAUTH_CLIENT_SECRET` — rotate in Google Cloud Console, update in Render.

Document each rotation in a `SECRETS_ROTATIONS.md` file (not committed — keep in password manager) with the rotation date and the person who rotated it.

## 7. Backup + restore runbook

Render Postgres Starter plan includes **automatic daily backups with 7-day retention**. This is NOT sufficient for a customer's ITR filing data — an accidental row delete noticed more than 7 days later is unrecoverable.

**Follow-up:**

1. Nightly cron (via Render cron job or external scheduler) running `pg_dump $DATABASE_URL | gzip | aws s3 cp - s3://trustaudit-backups/$(date +%F).sql.gz`.
2. Keep backups in an S3 bucket with versioning and a lifecycle rule: 90 days hot, 1 year cold.
3. Monthly restore drill — pick a random backup, restore it to a throwaway Postgres instance, verify row count matches production.
4. Document the drill results so auditors can see you did it.

## 8. Memory headroom

Render Starter plan is **512MB RAM**. The container runs:

- FastAPI + uvicorn (~150MB)
- Baileys sidecar (~200MB — Node has a heavier baseline than Python)
- Postgres client pool (~20MB)
- Gemini request preprocessing (Pillow image loads, ~50MB peak during a bill read)

Total steady-state is ~420MB. Add a concurrent bill read and you're at 470MB+. **Expect OOM kills under load.** Monitor `render metrics` for the first week; if the container gets oom-killed more than once in 24 hours, upgrade to Standard ($25/mo, 2GB RAM).

## 9. Rate limiting (already in place)

- Inbound WhatsApp webhook: IP rate limit 120/min, phone rate limit 10/min (see `backend/app/routes/webhook_whatsapp.py`).
- OTP send: phone rate limit 5/min + IP rate limit 20/min (see `backend/app/routes/auth/otp.py`).
- Magic link / signup / signin: IP rate limit (existing).

These use the in-memory `backend/app/services/rate_limit.py` module. It resets on every restart, which is fine for single-container deployments but breaks down if Render auto-scales horizontally. **Follow-up:** move to Redis when the customer count justifies it.

## 10. What is NOT production ready

Be honest with yourself about these. They must be done before the second or third paying customer:

- [ ] **Multi-tenant data isolation** — all vendors currently see rows filtered by their user id, but the `/api/live/*` endpoints fan out over a wildcard `*` session and leak anonymised fields. A future `multi_tenant` refactor needs to scope every query by the signed-in user's MSME id.
- [ ] **Admin dashboard** — there is no admin UI. Render logs + `render psql` is the admin surface. That is fine for customer 1, untenable by customer 10.
- [ ] **Billing** — there is no billing code. Every customer is implicitly on the free tier. When you start charging, integrate Razorpay (India-first, supports UPI) or Stripe India.
- [ ] **Email deliverability** — `EMAIL_PROVIDER=resend` is set in `render.yaml`, but the Resend domain must be verified (SPF/DKIM/DMARC records) in the DNS of whichever domain is sending. Without this, magic links will land in spam.
- [ ] **Monitoring + alerting** — there is no Sentry, no Datadog, no PagerDuty. If the Baileys sidecar drops at 3am nobody knows until the customer complains in the morning. At minimum: add a cron ping of `/api/webhook/whatsapp/health` with a Slack webhook alert on failure.
- [ ] **Audit log** — there is no audit log of who viewed which invoice. Indian CAs may ask for this during a compliance review of our processing.
- [ ] **SOC 2 / ISO 27001 posture** — neither has been pursued. Not blocking for MSME customers, blocking for enterprise customers.

## 11. How to roll back

If the deploy breaks:

1. **Render dashboard → Deploys → previous successful image → Rollback.** This is faster than git for emergency rollback.
2. For a code-level rollback: `git revert <merge-sha> && git push origin main` — Render auto-deploys the reverted commit.
3. The persistent disk `/app/data/` is **not touched by code rollbacks**, so the Baileys auth state and uploads survive. Only a `DATABASE_URL` env var change would strand the data.
4. If Postgres schema drift is the problem: `alembic downgrade <prev_rev>` in `render shell`. If that fails (e.g. because a column has already been dropped), restore from the last Render automatic backup — **expect to lose up to 24 hours of customer data** unless you have the nightly S3 backup from §7.

## 12. Emergency contacts

When shit hits the fan, these are the people / links you need:

- Render status: https://status.render.com/
- Gemini API status: https://status.cloud.google.com/ (search "Gemini API")
- Resend status: https://resend.com/status
- Meta platform status: https://metastatus.com/
- DPDP Act text (Indian Ministry of Electronics and Information Technology): https://www.meity.gov.in/data-protection-framework
- Data Protection Board of India: (not yet operational as of April 2026 — check MeitY for updates)

---

**Last updated:** 2026-04-07
**Next review:** on every new customer onboarding, or every 90 days — whichever comes first.
