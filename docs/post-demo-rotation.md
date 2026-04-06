# Post-demo credential rotation

These credentials were pasted into a Claude Code chat during the TrustAudit YC
demo bootstrap on 2026-04-06. Treat them as compromised the moment the demo
ends. Rotate each one via the steps below.

## Gemini API key

1. Go to https://aistudio.google.com/apikey
2. Find the key named `TRUSTAUDIT` (or whichever one was pasted)
3. Click the three-dot menu → **Delete**
4. Click **Create API key** to mint a new one
5. Update the `GEMINI_API_KEY` env var on Render and in `~/.config/trustaudit/env`

## Twilio auth token

1. Go to https://console.twilio.com/us1/account/keys-credentials/api-keys
2. In the account summary page, click **View** next to Primary Auth Token
3. Scroll down to **Secondary Auth Token** and click **Generate**
4. Test that the new token works with `curl` (see below)
5. Click **Promote Secondary Auth Token to Primary** — this rotates the primary.
   Any service still using the old primary will break until it gets the new one.
6. Update `TWILIO_AUTH_TOKEN` on Render and in `~/.config/trustaudit/env`

Verification curl (replace SID + token):

```
curl -u AC...:<new-token> https://api.twilio.com/2010-04-01/Accounts/AC....json
```

## Google OAuth client ID

The OAuth client ID itself is not a secret — it's public by design (embedded in
the frontend and seen by every user's browser). **No rotation needed unless the
client secret was exposed** (it was not, since we use the ID-token flow).

If you later add a client secret for server-side code exchange:
1. Go to https://console.cloud.google.com/apis/credentials
2. Find the OAuth 2.0 Client ID, click **Edit**
3. Delete the old secret, create a new one
4. Update env vars

## Render deploy hook

If you ever shared the Render deploy hook URL (Settings → Deploy Hook), rotate
it by clicking **Regenerate** on that page.

## JWT secret

The `JWT_SECRET` currently in `~/.config/trustaudit/env` is a dev-only value
(`dev-local-only-rotate-post-demo-<unix-epoch>`). For production, generate a
strong secret once:

```
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Then set it as `JWT_SECRET` in the Render dashboard. DO NOT commit it.

## Checklist

- [ ] Gemini API key rotated
- [ ] Twilio auth token rotated
- [ ] Render env vars updated
- [ ] Local ~/.config/trustaudit/env updated
- [ ] JWT_SECRET replaced with a production value
- [ ] Audit `.fleet/log/` and `~/.claude/projects/*` for any leaked credentials and scrub
- [ ] Confirm the live endpoint still works after rotation (`curl https://trustaudit.onrender.com/health`)

Once all boxes are checked, delete this file (the old creds are no longer
sensitive once rotated).
