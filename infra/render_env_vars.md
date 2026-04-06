# Render environment variables for TrustAudit

Paste these into the Render dashboard:
Dashboard → trustaudit → Environment → Add Environment Variable.

**Required (backend will not function without these):**

| Key | Value | Notes |
|---|---|---|
| `PORT` | (leave blank — Render auto-sets) | Default 10000 |
| `APP_ENV` | `production` | |
| `BASE_URL` | `https://trustaudit.onrender.com` | Used in OAuth redirects, email links, QR codes |
| `JWT_SECRET` | `<generate via: python -c "import secrets; print(secrets.token_urlsafe(48))">` | Never reuse the dev value |
| `VISION_PROVIDER` | `gemini` | |
| `GEMINI_API_KEY` | `<from ~/.config/trustaudit/env>` | |
| `GEMINI_MODEL` | `gemini-flash-latest` | |
| `WHATSAPP_PROVIDER` | `twilio` | |
| `TWILIO_ACCOUNT_SID` | `<from ~/.config/trustaudit/env>` | |
| `TWILIO_AUTH_TOKEN` | `<from ~/.config/trustaudit/env>` | Re-paste after you rotate |
| `TWILIO_PHONE_NUMBER` | `+18788801359` | (SMS-enabled Twilio number) |
| `TWILIO_WHATSAPP_FROM` | `whatsapp:+14155238886` | Sandbox From number |
| `TWILIO_SANDBOX_JOIN_CODE` | `crop-conversation` | |
| `SUBMIT_CONFIDENCE_THRESHOLD` | `0.85` | Below this, "Submit to Government" button is disabled |
| `EMAIL_PROVIDER` | `mock` | Set to `resend` and add `RESEND_API_KEY` when you want real emails |

**Optional (feature-gated):**

| Key | Value | Notes |
|---|---|---|
| `GOOGLE_OAUTH_CLIENT_ID` | `166888028367-86gi8h6lttlepkhl0ri7dqcllk53l8vk.apps.googleusercontent.com` | Enables Google sign-in |
| `FACEBOOK_APP_ID` | (not provided yet) | Disables Facebook login button if missing |
| `ANTHROPIC_API_KEY` | (not provided yet) | Fallback for Gemini failures |
| `RESEND_API_KEY` | (not provided yet) | Enables real email delivery |
| `DEMO_AT` | `2026-04-07T09:00+05:30` | Manager enforces integration freeze 2h before this |

## After pasting

1. Click **Save Changes**
2. Render will auto-redeploy (takes ~2 min)
3. Hit `https://trustaudit.onrender.com/health` — should return `{"status":"healthy"}`
4. Hit `https://trustaudit.onrender.com/api/webhook/whatsapp/health` — should return `active_provider: "twilio"` and `providers.twilio.status: "ok"`
5. Configure the Twilio Sandbox inbound webhook:
   - Twilio Console → Messaging → Try it out → Sandbox Settings
   - "When a message comes in" → `https://trustaudit.onrender.com/api/webhook/whatsapp/inbound` (HTTP POST)
   - "Status callback URL" → `https://trustaudit.onrender.com/api/webhook/whatsapp/status` (HTTP POST, optional)
   - Save

## UptimeRobot (prevents Render free-tier spindown)

1. Sign up at https://uptimerobot.com (free, no CC)
2. Add New Monitor → HTTP(s) → URL: `https://trustaudit.onrender.com/health`
3. Monitoring Interval: 5 minutes
4. Save

That's it — the site will stay warm 24/7.
