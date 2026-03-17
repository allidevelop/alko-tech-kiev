## Language
Always respond in Russian. Exception: technical terms that are commonly written in English (API, webhook, middleware, etc.).

# AL-KO Garden Store

Medusa.js v2 e-commerce backend for AL-KO garden equipment store (Ukrainian market).

## Quick Start
```bash
npm run dev          # Start dev server on port 9000
npm run build        # Build for production
```

## Storefront
Located at: `/home/developer/projects/alko-store-storefront/`
```bash
cd /home/developer/projects/alko-store-storefront && npm run dev  # Port 8000
```

## Database
PostgreSQL: `postgres://medusa_alko:medusa_alko_2026@localhost:5432/medusa_alko`

## Admin
- URL: http://localhost:9000/app
- Email: admin@alko-store.ua
- Password: Admin123!

## Product Catalog
- Source: `https://apipim.al-ko.ua/storage/xml_files/PriceList.xml`
- 650 products, 36 categories, Ukrainian language, UAH currency

## Integrations
- Nova Poshta (shipping): API key in .env
- Monobank (payments): Token in .env
- LiqPay (payments): To be configured

## Architecture
Medusa v2 modular architecture:
- `src/modules/` — custom modules (nova-poshta, monobank, liqpay)
- `src/api/` — custom API routes
- `src/scripts/` — import scripts
- `src/workflows/` — business logic workflows
- `src/subscribers/` — event handlers

## Documentation & Reference
- **FULL Medusa docs**: `.ralph/docs/medusa-llms-full.txt` (6.3 MB, 166K lines — ALL of Medusa v2 docs in one file)
- **Medusa MCP Server**: connected at `https://docs.medusajs.com/mcp` — query for real-time docs
- **Agent Skills**: `.ralph/docs/medusa-skills/` + `.ralph/docs/storefront-skills/` — official best practices
- **Module docs**: `.ralph/docs/NOVA-POSHTA-MODULE.md`, `MONOBANK-PAYMENT-MODULE.md`, `LIQPAY-PAYMENT-MODULE.md`
- **Payment Provider API**: `.ralph/docs/MEDUSA-PAYMENT-PROVIDER-REFERENCE.md`
