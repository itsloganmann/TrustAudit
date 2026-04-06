#!/usr/bin/env python3
"""Interactive Twilio sandbox bootstrap script.

Walks the user through creating a free Twilio trial account, grabbing
their Account SID + Auth Token + sandbox join code, and writes the
credentials to ``~/.config/trustaudit/env`` so the backend can pick them
up via ``source``.

Usage::

    python scripts/bootstrap_twilio.py
"""
from __future__ import annotations

import os
import sys
import webbrowser
from pathlib import Path

BANNER = r"""
================================================================
  TrustAudit -- Twilio WhatsApp Sandbox Bootstrap
================================================================
This script will:
  1. Open the Twilio signup page in your browser.
  2. Ask you to paste your Account SID and Auth Token.
  3. Ask for the WhatsApp sandbox join code.
  4. Write everything to ~/.config/trustaudit/env so the backend
     picks it up the next time you run `source ~/.config/trustaudit/env`.

Twilio free trial includes enough credit for hundreds of demo messages.
================================================================
"""

SIGNUP_URL = "https://www.twilio.com/try-twilio"
CREDENTIALS_HELP = (
    "After signing up, open https://console.twilio.com/ and copy the "
    "Account SID + Auth Token from the main dashboard."
)
SANDBOX_HELP = (
    "In Twilio Console, go to Messaging -> Try it out -> Send a WhatsApp "
    "message. Copy the 'join <two-words>' code shown under 'Sandbox "
    "Participants' (e.g. 'join happy-falcon')."
)

ENV_DIR = Path.home() / ".config" / "trustaudit"
ENV_FILE = ENV_DIR / "env"


def _prompt(label: str, required: bool = True) -> str:
    while True:
        value = input(f"{label}: ").strip()
        if value or not required:
            return value
        print("  (value is required)")


def main() -> int:
    print(BANNER)

    try:
        webbrowser.open(SIGNUP_URL)
    except Exception:
        pass
    print(f"Open this URL if the browser didn't launch: {SIGNUP_URL}\n")

    input("Press ENTER once you've signed up and are logged into the console...")
    print()
    print(CREDENTIALS_HELP)
    print()

    account_sid = _prompt("TWILIO_ACCOUNT_SID (starts with AC)")
    auth_token = _prompt("TWILIO_AUTH_TOKEN")

    print()
    print(SANDBOX_HELP)
    print()
    join_code = _prompt("TWILIO_JOIN_CODE (e.g. 'join happy-falcon')", required=False)
    sandbox_from = (
        _prompt(
            "TWILIO_SANDBOX_FROM (default +14155238886)",
            required=False,
        )
        or "+14155238886"
    )

    ENV_DIR.mkdir(parents=True, exist_ok=True)
    lines = [
        f"TWILIO_ACCOUNT_SID={account_sid}",
        f"TWILIO_AUTH_TOKEN={auth_token}",
        f"TWILIO_JOIN_CODE={join_code}",
        f"TWILIO_SANDBOX_FROM={sandbox_from}",
        "WHATSAPP_PROVIDER=twilio",
        "",
    ]
    ENV_FILE.write_text("\n".join(lines))
    os.chmod(ENV_FILE, 0o600)

    print()
    print(f"Wrote credentials to {ENV_FILE}")
    print()
    print("Next steps:")
    print("  1. Load the env file in your shell:")
    print(f"       source {ENV_FILE}")
    print("  2. Start the backend:")
    print("       uvicorn app.main:app --reload")
    print("  3. On a phone, send 'join <two-words>' to +1 415 523 8886 on WhatsApp")
    print("     using the join code above.")
    print("  4. Or paste these variables into Render dashboard -> Environment.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
