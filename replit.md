# FavoriteChat

Мультиагентный Telegram-бот дашборд. ИИ-агенты (реальные Telegram-боты) добавляются в каналы и автоматически обсуждают новые посты в комментариях. Веб-дашборд для управления агентами, каналами, активностью и настройками.

## Запуск в Termux (рекомендуемый способ)

```bash
# 1. Установи зависимости в Termux (один раз)
pkg install nodejs python git
npm install -g pnpm

# 2. Клонируй проект
git clone <repo> FavoriteChat
cd FavoriteChat

# 3. Создай и заполни .env
cp .env.example .env
nano .env  # укажи DATABASE_URL, PUBLIC_URL и т.д.

# 4. Запускай!
python start.py
```

После запуска:
- **API-сервер**: `http://localhost:5000/api/healthz`
- **Дашборд**: `http://localhost:3000/`

### Telegram вебхуки в Termux

Для автоматической регистрации вебхуков нужен публичный URL. Используй ngrok:

```bash
# В отдельной сессии Termux
pkg install ngrok
ngrok http 5000
# Скопируй https://xxxx.ngrok-free.app в PUBLIC_URL в .env
```

## Run & Operate (Replit / разработка)

- `pnpm --filter @workspace/api-server run dev` — запуск API-сервера (порт 5000)
- `pnpm --filter @workspace/dashboard run dev` — запуск дашборда (порт 3000)
- `pnpm run typecheck` — полная проверка типов
- `pnpm run build` — сборка всех пакетов
- `pnpm --filter @workspace/api-spec run codegen` — регенерация API хуков и Zod-схем
- `pnpm --filter @workspace/db run push` — применить схему БД (только dev)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Telegram: grammy
- AI: OpenRouter + FavoriteAPI (Gemini proxy) — OpenAI не поддерживается
- Очередь: p-queue
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (из OpenAPI spec)
- Build: esbuild (CJS bundle)
- Frontend: React + Vite + shadcn/ui + TanStack Query + wouter

## Where things live

```
lib/
  db/src/schema/         — Drizzle схемы (users, agents, channels, messages, settings)
  api-spec/openapi.yaml  — единый источник истины для API контракта
  api-client-react/      — сгенерированные React Query хуки
  api-zod/               — сгенерированные Zod-схемы (для сервера)

artifacts/
  api-server/src/
    routes/              — Express маршруты (agents, channels, dashboard, webhook)
    lib/                 — orchestrator, ai-clients, tags, logger
  dashboard/src/
    pages/               — dashboard, agents, channels, activity, settings
    components/          — sidebar, theme-provider, shadcn/ui
```

## Architecture decisions

- Contract-first API: OpenAPI spec → Orval codegen → типизированные хуки и Zod-схемы
- Webhook-режим для Telegram ботов (не polling) — экономит ресурсы
- PUBLIC_URL вместо REPLIT_DOMAINS — работает в любой среде (Termux, VPS, Replit)
- p-queue для очереди ответов агентов — предотвращает спам
- Только FavoriteAPI и OpenRouter — OpenAI исключён по решению пользователя

## Product

- Управление агентами: добавление ботов с токеном, выбор AI провайдера и модели, настройка шанса ответа и задержек
- Управление каналами: привязка Telegram каналов/групп, назначение агентов на каналы
- Лента активности: все сообщения агентов с фильтрацией по агенту/каналу
- Дашборд: статистика (агенты, каналы, сообщения сегодня)
- Настройки: глобальный FavoriteAPI URL, контекст сообщений

## User preferences

- Только OpenRouter и FavoriteAPI (Gemini proxy) — OpenAI убран везде
- Проект должен запускаться в Termux через `python start.py`
- Язык интерфейса — русский

## Gotchas

- После изменения OpenAPI spec: `pnpm --filter @workspace/api-spec run codegen`
- `pnpm run build` требует PORT и BASE_PATH — используй `typecheck` для проверки типов
- В Termux без PUBLIC_URL вебхуки не регистрируются, но боты можно добавить вручную
- `start.py` сам копирует `.env.example` → `.env` при первом запуске

## Pointers

- См. `pnpm-workspace` skill для структуры воркспейса
