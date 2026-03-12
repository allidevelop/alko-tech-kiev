# AL-KO Garden Store — Build & Run Instructions

## Backend (Medusa)

```bash
cd /home/developer/projects/alko-store
npm install
npm run dev          # Development mode, port 9000
npm run build        # Production build
npm run start        # Production mode
```

Admin panel: http://localhost:9000/app

## Storefront (Next.js)

```bash
cd /home/developer/projects/alko-store-storefront
npm install
npm run dev          # Development mode, port 3104
npm run build        # Production build
npm run start        # Production start
```

Storefront: http://localhost:8000

## Database

PostgreSQL 16 on localhost:5432
- Database: medusa_alko
- User: medusa_alko
- Password: medusa_alko_2026

## Run Import Script

```bash
cd /home/developer/projects/alko-store
npx medusa exec ./src/scripts/import-alko.ts
```

## Environment

Backend `.env` is at `/home/developer/projects/alko-store/.env`
Storefront `.env.local` is at `/home/developer/projects/alko-store-storefront/.env.local`

## Testing

```bash
# Check backend starts
cd /home/developer/projects/alko-store && npm run dev &
sleep 10 && curl -s http://localhost:9000/health | head -5
kill %1

# Check storefront builds
cd /home/developer/projects/alko-store-storefront && npm run build
```
