# Performance Marketing Manager — Instructions

## Meta Ads MCP Server

### Location
- Package archive: `/home/developer/projects/alko-store/meta-ads-mcp-package.tar.gz`
- Extracted to: `/tmp/meta-ads-mcp/` (extract with `tar -xzf` if missing)
- Virtual env: `/tmp/meta-ads-mcp/.venv/`
- Version: `meta-ads-mcp v1.12.2` (by pipeboard.co)

### How to Run (Local MCP via stdio)
Configured in `.mcp.json` at project root. Uses `META_ACCESS_TOKEN` from `.claude.json` project config (key `meta-ads-local`).
```json
{
  "meta-ads": {
    "command": "/tmp/meta-ads-mcp/.venv/bin/python",
    "args": ["-m", "meta_ads_mcp"],
    "env": {
      "META_ACCESS_TOKEN": "<from .claude.json project config>"
    }
  }
}
```

### Authentication
- **Active method**: Direct `META_ACCESS_TOKEN` (long-lived Facebook user token with `ads_read` + `ads_management`)
- Token is stored in `/home/developer/.claude.json` → `projects["/home/developer/projects/alko-store"].mcpServers["meta-ads-local"].env.META_ACCESS_TOKEN`
- Token auto-refresh: `scripts/refresh-meta-token.sh` (cron every 50 days, token lives 60 days)
- Meta App ID: `1390634508995767`

### Accessible Ad Accounts
| Account ID | Name | Currency | Status |
|---|---|---|---|
| `act_635550672244541` | Inprod 2 | USD | Active |
| `act_950301993640061` | Каулько Владислав | USD | Active |
| `act_1216426970124771` | Inprod ads acc | USD | Active |
| `act_1412943219742906` | Pet Supplies | USD | Unsettled |
| `act_2159083171163017` | wisecat | USD | Active |
| `act_1523564008634061` | Tolyko Partneram | USD | Active |

### Available Tools (36 tools)
- `get_ad_accounts` — list accessible ad accounts
- `get_account_info` — account details (act_XXXXXXXXX)
- `get_account_pages` — pages linked to account
- `get_campaigns` — list campaigns with filters
- `get_campaign_details` — single campaign detail
- `create_campaign` — create new campaign
- `update_campaign` — update campaign
- `get_adsets` — list ad sets
- `get_adset_details` — ad set detail
- `create_adset` — create ad set
- `update_adset` — update ad set targeting/frequency
- `get_ads` — list ads
- `get_ad_details` — ad detail
- `create_ad` — create ad with existing creative
- `get_ad_creatives` — creative details
- `get_ad_image` — download/visualize ad image
- `update_ad` — update ad status/bid
- `upload_ad_image` — upload image for creatives
- `upload_ad_video` — upload video for creatives
- `create_ad_creative` — create creative (image hash, page, link)
- `update_ad_creative` — update creative
- `search_pages_by_name` — search Facebook pages
- `get_insights` — performance metrics (spend, clicks, conversions, ROAS)
- `get_login_link` — auth link
- `search_ads_archive` — search Meta ad library
- `create_budget_schedule` — budget scheduling
- `search_interests` — interest targeting search
- `get_interest_suggestions` — interest suggestions
- `estimate_audience_size` — estimate audience reach
- `search_behaviors` — behavior targeting
- `search_demographics` — demographic targeting
- `search_geo_locations` — geo location search
- `search` — generic search across accounts/campaigns/ads/pages
- `fetch` — generic Graph API fetch
- `generate_image` — AI image generation
- `generate_and_upload_ad_image` — generate + upload ad image

### Usage Notes
- All tools accept optional `access_token` param (overrides cached/env token)
- Account IDs use format `act_XXXXXXXXX`
- Budgets are in cents (e.g., 10000 = $100.00)
- Campaign objectives must use ODAX format: `OUTCOME_AWARENESS`, `OUTCOME_TRAFFIC`, `OUTCOME_ENGAGEMENT`, `OUTCOME_LEADS`, `OUTCOME_SALES`, `OUTCOME_APP_PROMOTION`

## Google Ads
- Config: `google-ads.yaml` in project root
- Account: `4646925044`
- Conversion tag: `AW-18024309927`
- Has developer token + OAuth2 credentials

## Google Analytics 4
- Measurement ID: `G-T5KSYWRJZE`
- API Secret configured in storefront

## Tracking Pixels (Active on Storefront)
- Meta Pixel: `1438859913890738`
- Google Ads tag: `AW-18024309927`
- Events: ViewContent, AddToCart, InitiateCheckout, Purchase
