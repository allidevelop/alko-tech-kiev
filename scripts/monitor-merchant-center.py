#!/usr/bin/env python3
"""Monitor Google Merchant Center product statuses and send Telegram reports."""
import json
import urllib.request
import subprocess
import google.auth.transport.requests
from google.oauth2.credentials import Credentials

MERCHANT_ID = "5747965785"
CLIENT_ID = "697237527851-aueufb6kguqk6f03l04vtp89ljvm6jov.apps.googleusercontent.com"
CLIENT_SECRET = "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"
REFRESH_TOKEN = "1//03CwcLPnYhCHHCgYIARAAGAMSNwF-L9IraoKdJjkQiAxZKDl1V_eP1F68rmbJSbdOxWTmNEUzBccalRsqGty9Q4wPHBx4aXRG7ao"
TELEGRAM_BOT = "8080753063:AAF3JMs_4xzaJvkmy_1gtO16N8ElU_wgaSc"
TELEGRAM_CHAT = "6552346228"


def get_credentials():
    creds = Credentials(
        token=None,
        refresh_token=REFRESH_TOKEN,
        client_id=CLIENT_ID,
        client_secret=CLIENT_SECRET,
        token_uri="https://oauth2.googleapis.com/token",
    )
    creds.refresh(google.auth.transport.requests.Request())
    return creds


def get_product_statuses(creds):
    all_issues = {}
    total = 0
    approved = 0
    disapproved = 0
    pending = 0
    next_token = None

    while True:
        url = f"https://shoppingcontent.googleapis.com/content/v2.1/{MERCHANT_ID}/productstatuses?maxResults=250"
        if next_token:
            url += f"&pageToken={next_token}"

        req = urllib.request.Request(url, headers={"Authorization": f"Bearer {creds.token}"})
        resp = urllib.request.urlopen(req)
        data = json.loads(resp.read())

        for p in data.get("resources", []):
            total += 1
            issues = p.get("itemLevelIssues", [])

            has_disapproved = False
            has_pending = False
            for issue in issues:
                code = issue.get("code", "")
                desc = issue.get("description", code)
                sev = issue.get("servability", "")

                if sev == "disapproved":
                    has_disapproved = True
                if "pending" in code:
                    has_pending = True

                if code not in all_issues:
                    all_issues[code] = {"count": 0, "desc": desc, "severity": sev}
                all_issues[code]["count"] += 1

            if has_disapproved:
                disapproved += 1
            elif has_pending:
                pending += 1
            else:
                approved += 1

        next_token = data.get("nextPageToken")
        if not next_token:
            break

    return total, approved, pending, disapproved, all_issues


def send_telegram(msg):
    try:
        subprocess.run([
            "curl", "-s", "-X", "POST",
            f"https://api.telegram.org/bot{TELEGRAM_BOT}/sendMessage",
            "-d", f"chat_id={TELEGRAM_CHAT}",
            "-d", "parse_mode=Markdown",
            "-d", f"text={msg}",
        ], capture_output=True, timeout=10)
    except Exception:
        pass


def main():
    creds = get_credentials()
    total, approved, pending, disapproved, issues = get_product_statuses(creds)

    msg = f"""📊 *Merchant Center Report*

Всього товарів: {total}
✅ Затверджено: {approved}
⏳ На модерації: {pending}
❌ Відхилено: {disapproved}

*Проблеми:*"""

    critical = []
    warnings = []
    for code, info in sorted(issues.items(), key=lambda x: -x[1]["count"]):
        line = f"• {info['desc']} — {info['count']} шт."
        if info["severity"] == "disapproved":
            critical.append(line)
        else:
            warnings.append(line)

    if critical:
        msg += "\n🔴 Критичні:\n" + "\n".join(critical[:5])
    if warnings:
        msg += "\n🟡 Попередження:\n" + "\n".join(warnings[:5])

    if not critical and not warnings:
        msg += "\n✅ Жодних проблем!"

    send_telegram(msg)
    print(msg)


if __name__ == "__main__":
    main()
