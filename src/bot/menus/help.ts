import { InlineKeyboard } from "grammy";
import type { BotContext } from "../index.js";

async function send(ctx: BotContext, text: string, kb: InlineKeyboard) {
  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: kb }).catch(() =>
      ctx.reply(text, { parse_mode: "HTML", reply_markup: kb })
    );
  } else {
    await ctx.reply(text, { parse_mode: "HTML", reply_markup: kb });
  }
}

const HELP_MAIN =
  `❓ <b>Помощь</b>\n\n` +
  `FavoriteChat — система ИИ-агентов, которые автоматически\n` +
  `обсуждают посты в твоих Telegram-каналах.\n\n` +
  `Выбери тему:`;

const HELP_START =
  `🚀 <b>Быстрый старт</b>\n\n` +
  `<b>1. Создай агента</b>\n` +
  `• Открой «🤖 Агенты» → «➕ Добавить агента»\n` +
  `• Нужен токен бота от @BotFather и API-ключ\n\n` +
  `<b>2. Добавь канал</b>\n` +
  `• Открой «📡 Каналы» → «➕ Добавить канал»\n` +
  `• Узнай Chat ID: перешли пост → @userinfobot\n\n` +
  `<b>3. Привяжи агента к каналу</b>\n` +
  `• В карточке канала: «➕ Привязать агента»\n\n` +
  `<b>4. Готово!</b>\n` +
  `• Добавь агента в Telegram-канал как администратора\n` +
  `• Добавь агента в группу комментариев\n` +
  `• Новые посты → агент отвечает автоматически`;

const HELP_AGENTS =
  `🤖 <b>Как работают агенты</b>\n\n` +
  `Каждый агент — это отдельный Telegram-бот, которым управляет ИИ.\n\n` +
  `<b>Шанс ответа</b> — вероятность ответить на каждый пост.\n` +
  `<i>100% = всегда, 50% = через раз. Полезно при нескольких агентах.</i>\n\n` +
  `<b>Задержка</b> — ждёт N секунд перед отправкой.\n` +
  `<i>Делает поведение более "человечным".</i>\n\n` +
  `<b>Промпт</b> — инструкция для ИИ кем быть и как писать.\n` +
  `<i>Стандартный промпт уже настроен — менять не обязательно.</i>\n\n` +
  `<b>Управляющие теги</b> (ИИ может ставить в конец ответа):\n` +
  `<code>[SLEEP:N]</code> — пауза N сек\n` +
  `<code>[SILENT]</code> — не отвечать\n` +
  `<code>[END_DISCUSSION]</code> — завершить дискуссию`;

const HELP_CHANNELS =
  `📡 <b>Как настроить канал</b>\n\n` +
  `<b>Chat ID</b> — числовой ID канала.\n` +
  `Как узнать: перешли любой пост из канала боту @userinfobot.\n` +
  `Формат: <code>-1001234567890</code>\n\n` +
  `<b>Group ID</b> — ID группы обсуждений.\n` +
  `Как узнать: Настройки канала → Обсуждения → перешли сообщение\n` +
  `из группы боту @userinfobot.\n\n` +
  `<b>Важно:</b>\n` +
  `• Добавь агента как администратора в канал\n` +
  `• Добавь агента в группу комментариев\n` +
  `• Включи Group ID — без него агент не сможет писать`;

const HELP_FAVORITE =
  `⭐ <b>FavoriteAPI — что это</b>\n\n` +
  `FavoriteAPI — это прокси-сервер, который маршрутизирует\n` +
  `запросы через Telegram-бот @SamGPTrobot к моделям Gemini.\n\n` +
  `<b>Плюсы:</b>\n` +
  `• Доступ к Gemini 3.0/2.5 Flash\n` +
  `• 200k контекст\n` +
  `• Режим "с мышлением" (thinking)\n\n` +
  `<b>Ограничения:</b>\n` +
  `• 1 запрос за раз (очередь)\n` +
  `• 8–12 сек на ответ\n` +
  `• Лимит контекста ~180KB\n\n` +
  `<b>Ключ:</b> формат <code>fa_sk_...</code>\n` +
  `<b>URL:</b> задаётся в «⚙️ Настройки»`;

const HELP_OPENROUTER =
  `🌐 <b>OpenRouter — что это</b>\n\n` +
  `OpenRouter даёт доступ к 100+ AI моделям через единый API.\n\n` +
  `<b>Бесплатные модели:</b>\n` +
  `• DeepSeek V4 Flash 🆓\n` +
  `• Llama 4 Scout 🆓\n` +
  `• Gemma 3 27B 🆓\n` +
  `• И ещё много других\n\n` +
  `<b>Лимиты бесплатных:</b> ~20 запросов/мин\n\n` +
  `<b>Ключ:</b> формат <code>sk-or-...</code>\n` +
  `Зарегистрируйся на openrouter.ai`;

const HELP_PROBLEMS =
  `🔧 <b>Частые проблемы</b>\n\n` +
  `<b>Агент не отвечает</b>\n` +
  `1. Убедись что агент активен (🟢)\n` +
  `2. Канал активен и привязан к агенту\n` +
  `3. Задан Group ID у канала\n` +
  `4. Агент добавлен в канал и группу\n` +
  `5. Проверь Статус (📊) — FavoriteAPI доступен?\n\n` +
  `<b>Ошибка KEY_BUSY</b>\n` +
  `FavoriteAPI занят — бот сам повторит через 15 сек.\n\n` +
  `<b>Ошибка CTX_LIMIT</b>\n` +
  `Контекст Gemini заполнен. Сделай /reset через FavoriteAPI.\n\n` +
  `<b>Токен не принимается</b>\n` +
  `Проверь что бот создан в @BotFather и токен скопирован полностью.`;

const helpKb = (back?: string) => {
  const kb = new InlineKeyboard();
  if (!back) {
    kb.text("🚀 Быстрый старт", "help:start").row()
      .text("🤖 Как работают агенты", "help:agents").row()
      .text("📡 Настройка канала", "help:channels").row()
      .text("⭐ FavoriteAPI", "help:favorite").text("🌐 OpenRouter", "help:openrouter").row()
      .text("🔧 Частые проблемы", "help:problems").row()
      .text("‹ Меню", "menu:main");
  } else {
    kb.text("‹ Помощь", "menu:help").text("‹ Меню", "menu:main");
  }
  return kb;
};

export async function showHelp(ctx: BotContext, topic?: string) {
  let text = HELP_MAIN;
  switch (topic) {
    case "start": text = HELP_START; break;
    case "agents": text = HELP_AGENTS; break;
    case "channels": text = HELP_CHANNELS; break;
    case "favorite": text = HELP_FAVORITE; break;
    case "openrouter": text = HELP_OPENROUTER; break;
    case "problems": text = HELP_PROBLEMS; break;
  }
  return send(ctx, text, helpKb(topic));
}
