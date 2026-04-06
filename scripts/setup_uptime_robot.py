#!/usr/bin/env python3
"""setup_uptime_robot.py -- create UptimeRobot monitors for TrustAudit.

UptimeRobot keeps the Render free-tier service warm by hitting /health
every 5 minutes. The free plan allows 50 monitors which is plenty for
TrustAudit's 5 health endpoints.

Usage
-----
    # Manual mode (just print the steps -- the default)
    python scripts/setup_uptime_robot.py

    # Automated mode (requires UPTIMEROBOT_API_KEY env var)
    UPTIMEROBOT_API_KEY=ur1234... python scripts/setup_uptime_robot.py --create

The API key can be obtained from:
    https://uptimerobot.com/dashboard.php#mySettings  ->  "Main API Key"

API docs:
    https://uptimerobot.com/api/
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from typing import Iterable

BASE_URL = os.environ.get("BASE_URL", "https://trustaudit.onrender.com")

MONITORS: tuple[tuple[str, str], ...] = (
    ("TrustAudit -- /health",                       "/health"),
    ("TrustAudit -- /api/invoices",                 "/api/invoices"),
    ("TrustAudit -- /api/stats",                    "/api/stats"),
    ("TrustAudit -- /api/webhook/whatsapp/health",  "/api/webhook/whatsapp/health"),
    ("TrustAudit -- /api/demo/health",              "/api/demo/health"),
)

UPTIMEROBOT_API = "https://api.uptimerobot.com/v2/newMonitor"
INTERVAL_SECONDS = 300  # 5 minutes (free plan minimum)
MONITOR_TYPE_HTTP = 1


def _print_manual_instructions() -> None:
    print("=" * 70)
    print("UptimeRobot manual setup -- TrustAudit")
    print("=" * 70)
    print()
    print("1. Create a free account at https://uptimerobot.com (no credit card)")
    print()
    print("2. Add the following 5 HTTP monitors:")
    print(f"   (Dashboard -> Add New Monitor -> HTTP(s), interval = 5 minutes)")
    print()
    for label, path in MONITORS:
        print(f"   * {label}")
        print(f"     URL: {BASE_URL}{path}")
        print()
    print("3. (Optional) configure email alert contacts under My Settings.")
    print()
    print("4. To automate this in the future, set UPTIMEROBOT_API_KEY and run:")
    print("   python scripts/setup_uptime_robot.py --create")
    print()


def _create_monitor(api_key: str, label: str, url: str) -> dict:
    data = urllib.parse.urlencode({
        "api_key": api_key,
        "format": "json",
        "type": MONITOR_TYPE_HTTP,
        "url": url,
        "friendly_name": label,
        "interval": INTERVAL_SECONDS,
    }).encode("utf-8")

    request = urllib.request.Request(
        UPTIMEROBOT_API,
        data=data,
        headers={
            "content-type": "application/x-www-form-urlencoded",
            "cache-control": "no-cache",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        return {"stat": "fail", "error": {"message": f"HTTP {exc.code}: {body}"}}
    except urllib.error.URLError as exc:
        return {"stat": "fail", "error": {"message": str(exc)}}

    return payload


def _create_all(api_key: str, monitors: Iterable[tuple[str, str]]) -> int:
    failures = 0
    for label, path in monitors:
        url = f"{BASE_URL}{path}"
        print(f"creating: {label} -> {url} ... ", end="", flush=True)
        result = _create_monitor(api_key, label, url)
        if result.get("stat") == "ok":
            monitor_id = result.get("monitor", {}).get("id", "?")
            print(f"OK (id={monitor_id})")
        else:
            err = result.get("error", {}).get("message") or json.dumps(result)
            print(f"FAILED -- {err}")
            failures += 1
    return failures


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--create",
        action="store_true",
        help="actually create monitors via the UptimeRobot API",
    )
    parser.add_argument(
        "--api-key",
        default=os.environ.get("UPTIMEROBOT_API_KEY"),
        help="UptimeRobot main API key (or set UPTIMEROBOT_API_KEY)",
    )
    args = parser.parse_args(argv)

    if not args.create:
        _print_manual_instructions()
        return 0

    if not args.api_key:
        print("ERROR: --create requires UPTIMEROBOT_API_KEY env var or --api-key", file=sys.stderr)
        return 2

    failures = _create_all(args.api_key, MONITORS)
    if failures:
        print(f"\n{failures} monitor(s) failed to create", file=sys.stderr)
        return 1
    print("\nAll monitors created. Verify at https://uptimerobot.com/dashboard.php")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
