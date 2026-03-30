#!/usr/bin/env python3
"""
Monitor Google Search Console — indexing status, search performance, sitemaps.
Sends daily Telegram report.

Cron: 0 10 * * * python3 /home/developer/projects/alko-store/scripts/monitor-search-console.py
"""
import json
import urllib.request
import urllib.parse
import subprocess
import os
from datetime import datetime, timedelta

import google.auth.transport.requests
from google.oauth2.credentials import Credentials

# Config — all secrets read from .env
env_path = "/home/developer/projects/alko-store/.env"
_env = {}
if os.path.exists(env_path):
    with open(env_path) as f:
        for line in f:
            if "=" in line and not line.startswith("#"):
                k, v = line.strip().split("=", 1)
                _env[k] = v

CLIENT_ID = _env.get("GSC_CLIENT_ID", "")
CLIENT_SECRET = _env.get("GSC_CLIENT_SECRET", "")
REFRESH_TOKEN = _env.get("GSC_REFRESH_TOKEN", "")
SITE = _env.get("GSC_SITE", "sc-domain:alko-technics.kiev.ua")
TELEGRAM_BOT = _env.get("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT = _env.get("TELEGRAM_CHAT_ID", "")
PAGESPEED_KEY = _env.get("GOOGLE_PAGESPEED_API_KEY", "")


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


def api_get(creds, url):
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {creds.token}"})
    resp = urllib.request.urlopen(req)
    return json.loads(resp.read())


def api_post(creds, url, body):
    data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, headers={
        "Authorization": f"Bearer {creds.token}",
        "Content-Type": "application/json",
    })
    resp = urllib.request.urlopen(req)
    return json.loads(resp.read())


def get_sitemaps(creds):
    site_enc = urllib.parse.quote(SITE, safe="")
    url = f"https://www.googleapis.com/webmasters/v3/sites/{site_enc}/sitemaps"
    data = api_get(creds, url)
    results = []
    for sm in data.get("sitemap", []):
        contents = sm.get("contents", [{}])[0] if sm.get("contents") else {}
        results.append({
            "path": sm.get("path", "?"),
            "submitted": contents.get("submitted", 0),
            "indexed": contents.get("indexed", 0),
            "last_downloaded": sm.get("lastDownloaded", "?"),
        })
    return results


def get_search_performance(creds, days=7):
    site_enc = urllib.parse.quote(SITE, safe="")
    url = f"https://www.googleapis.com/webmasters/v3/sites/{site_enc}/searchAnalytics/query"

    end_date = datetime.now().strftime("%Y-%m-%d")
    start_date = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")

    # Overall stats
    body = {
        "startDate": start_date,
        "endDate": end_date,
    }
    overall = api_post(creds, url, body)

    total_clicks = sum(r.get("clicks", 0) for r in overall.get("rows", []))
    total_impressions = sum(r.get("impressions", 0) for r in overall.get("rows", []))

    # Top pages
    body["dimensions"] = ["page"]
    body["rowLimit"] = 10
    pages_data = api_post(creds, url, body)
    pages = []
    for row in pages_data.get("rows", []):
        pages.append({
            "page": row["keys"][0].replace("https://alko-technics.kiev.ua", ""),
            "clicks": row.get("clicks", 0),
            "impressions": row.get("impressions", 0),
            "position": round(row.get("position", 0), 1),
        })

    # Top queries
    body["dimensions"] = ["query"]
    body["rowLimit"] = 10
    queries_data = api_post(creds, url, body)
    queries = []
    for row in queries_data.get("rows", []):
        queries.append({
            "query": row["keys"][0],
            "clicks": row.get("clicks", 0),
            "impressions": row.get("impressions", 0),
            "position": round(row.get("position", 0), 1),
        })

    return {
        "clicks": total_clicks,
        "impressions": total_impressions,
        "pages": pages,
        "queries": queries,
        "period": f"{start_date} — {end_date}",
    }


def get_pagespeed_score():
    try:
        url = (
            f"https://www.googleapis.com/pagespeedonline/v5/runPagespeed?"
            f"url=https%3A%2F%2Falko-technics.kiev.ua%2Fuk&strategy=mobile"
            f"&category=PERFORMANCE&key={PAGESPEED_KEY}"
        )
        req = urllib.request.Request(url)
        resp = urllib.request.urlopen(req, timeout=120)
        data = json.loads(resp.read())
        score = data.get("lighthouseResult", {}).get("categories", {}).get("performance", {}).get("score", 0)
        return int(score * 100) if score else None
    except Exception:
        return None


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
    if not REFRESH_TOKEN:
        print("ERROR: GSC_REFRESH_TOKEN not found in .env")
        return

    creds = get_credentials()

    # Sitemaps
    sitemaps = get_sitemaps(creds)

    # Search performance
    perf = get_search_performance(creds, days=7)

    # PageSpeed (optional, may timeout)
    ps_score = get_pagespeed_score()

    # Build report
    msg = "📊 *Search Console — Daily Report*\n"
    msg += f"_{perf['period']}_\n\n"

    # Indexing
    for sm in sitemaps:
        msg += f"🗺 *Sitemap:* {sm['submitted']} подано, {sm['indexed']} проіндексовано\n"

    msg += f"\n🔍 *Пошук (7 днів):*\n"
    msg += f"• Кліки: {perf['clicks']}\n"
    msg += f"• Покази: {perf['impressions']}\n"

    if perf["pages"]:
        msg += f"\n📄 *Топ сторінки:*\n"
        for p in perf["pages"][:5]:
            msg += f"• `{p['page'][:40]}` — {p['impressions']} показів, поз. {p['position']}\n"

    if perf["queries"]:
        msg += f"\n🔑 *Топ запити:*\n"
        for q in perf["queries"][:5]:
            msg += f"• \"{q['query']}\" — {q['impressions']} показів, поз. {q['position']}\n"

    if ps_score is not None:
        emoji = "🟢" if ps_score >= 90 else "🟡" if ps_score >= 50 else "🔴"
        msg += f"\n⚡ *PageSpeed Mobile:* {emoji} {ps_score}/100"

    send_telegram(msg)
    print(msg)


if __name__ == "__main__":
    main()
