# Cloudflare DNS / Domain Setup -- TrustAudit

These are the **manual** Cloudflare steps for fronting the Render
deployment with a real domain (e.g. `trustaudit.app` or
`trustaudit.is-a.dev`). Cloudflare adds:

- TLS offloading + universal SSL
- DDoS protection + WAF (free tier)
- Edge caching for the static frontend bundle
- A nicer URL than `trustaudit.onrender.com`

This is **deferred to P1** in the manager state -- the demo can ship
on the bare `*.onrender.com` URL. These instructions are here so the
ops handover is one file, not a Slack thread.

## Prerequisites

1. A registered domain (or an approved `is-a.dev` subdomain).
2. Cloudflare free account at https://dash.cloudflare.com/sign-up
3. Render deployment confirmed live at `https://trustaudit.onrender.com`

## Step 1 -- Add the site to Cloudflare

1. Cloudflare dashboard -> "Add a Site"
2. Enter your apex domain (e.g. `trustaudit.app`) and select the Free plan
3. Cloudflare will scan for existing DNS records -- accept the import
4. Update your registrar's nameservers to the two Cloudflare NS records shown
5. Wait for the activation email (~5 minutes for most TLDs)

## Step 2 -- Add a CNAME record for Render

| Type   | Name              | Target                          | Proxy status |
|--------|-------------------|---------------------------------|--------------|
| CNAME  | `@` (apex)        | `trustaudit.onrender.com`       | Proxied      |
| CNAME  | `www`             | `trustaudit.onrender.com`       | Proxied      |

Note: Cloudflare's "CNAME flattening" automatically handles the apex CNAME,
which is normally illegal in DNS. No special action required.

## Step 3 -- Tell Render about the custom domain

1. Render dashboard -> trustaudit -> Settings -> Custom Domains
2. Click "Add Custom Domain", enter `trustaudit.app`
3. Render will issue a Let's Encrypt cert (usually within ~2 minutes)
4. Repeat for `www.trustaudit.app`

## Step 4 -- SSL/TLS mode in Cloudflare

1. Cloudflare dashboard -> SSL/TLS -> Overview
2. Set encryption mode to **Full (strict)**
   * "Flexible" is insecure -- traffic Cloudflare->Render would be plaintext
   * "Full" allows self-signed certs on origin -- Render uses Let's Encrypt so use Strict

## Step 5 -- Page Rules (optional, free plan allows 3)

1. SSL/TLS -> Edge Certificates -> "Always Use HTTPS" = ON
2. Page Rule: `https://trustaudit.app/api/*` -> Cache Level = Bypass
3. Page Rule: `https://trustaudit.app/assets/*` -> Cache Level = Cache Everything,
   Edge Cache TTL = 1 day

## Step 6 -- Update env vars

Once the domain is live, update Render dashboard env vars:

```
BASE_URL=https://trustaudit.app
GOOGLE_OAUTH_CLIENT_ID=<may need new client id with new authorized origin>
```

And update Twilio Sandbox webhook URLs to the new domain
(see `infra/render_env_vars.md`).

## Step 7 -- Verification

```bash
# DNS resolution
dig +short trustaudit.app

# TLS handshake
curl -vI https://trustaudit.app/health 2>&1 | grep -E '^[<>] (HTTP|server)'

# End-to-end
./scripts/render_check.sh    # set BASE_URL=https://trustaudit.app first
```

## Troubleshooting

| Symptom                                   | Likely cause                    | Fix                                       |
|-------------------------------------------|---------------------------------|-------------------------------------------|
| 526 "Invalid SSL certificate"             | TLS mode is Strict but Render hasn't issued a cert yet | Wait 2-5 min, retry              |
| 522 Connection timed out                  | Render service is asleep        | Hit /health to wake it, then UptimeRobot keeps it warm |
| Cookies not setting after signin          | Session cookie SameSite mismatch | Verify `BASE_URL` matches the proxied origin |
| OAuth redirect_uri_mismatch               | Google Cloud authorized origins don't include the new domain | Add it in console.cloud.google.com |
