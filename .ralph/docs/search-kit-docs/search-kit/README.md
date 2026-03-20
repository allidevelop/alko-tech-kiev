# Search Kit — универсальный поиск для Next.js + Payload CMS

Готовая реализация поиска из проекта VIP Journal. Адаптируй под свой интернет-магазин или любой другой проект на Next.js 15 + Payload CMS 3.

## Что внутри

```
search-kit/
├── README.md                  ← Ты здесь (инструкция для агента)
├── api/
│   └── search/route.ts        ← API-эндпоинт поиска (серверный)
├── components/
│   └── SearchOverlay.tsx       ← Клиентский модальный оверлей
└── AGENT_INSTRUCTIONS.md      ← Подробная инструкция для AI-агента
```

## Быстрый старт

1. Скопируй `api/search/route.ts` → `src/app/api/search/route.ts`
2. Скопируй `components/SearchOverlay.tsx` → `src/components/layout/SearchOverlay.tsx`
3. Добавь `<SearchOverlay locale="en" />` в корневой layout
4. Добавь кнопку с классом `.search-btn` в header
5. Адаптируй коллекции и поля поиска под свою схему данных

## Подробности — смотри `AGENT_INSTRUCTIONS.md`
