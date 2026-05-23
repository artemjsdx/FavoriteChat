import { InlineKeyboard } from "grammy";
import type { BotContext } from "../index.js";
import { db, agentsTable } from "../../db/index.js";
import { pollingManager } from "../../core/polling.js";
import { showAgentInfo } from "../menus/agents.js";

const STEPS = 8;
function prog(step: number): string {
  return Array.from({ length: STEPS }, (_, i) => (i < step ? "●" : "○")).join(" ");
}

const FAVORITE_MODELS = [
  { id: "gemini-3.0-flash-thinking", label: "Gemini 3.0 Flash Thinking 🧠 (рекомендуется)" },
  { id: "gemini-3.0-flash", label: "Gemini 3.0 Flash ⚡ (быстрее)" },
  { id: "gemini-2.5-flash-thinking", label: "Gemini 2.5 Flash Thinking 🧠" },
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash ⚡" },
  { id: "gemini-2.5-mini-thinking", label: "Gemini 2.5 Mini Thinking" },
  { id: "gemini-2.5-mini", label: "Gemini 2.5 Mini" },
];

const OPENROUTER_MODELS = [
  { id: "deepseek/deepseek-v4-flash:free", label: "DeepSeek V4 Flash 🆓 (рекомендуется)" },
  { id: "meta-llama/llama-4-scout:free", label: "Llama 4 Scout 🆓" },
  { id: "google/gemma-3-27b-it:free", label: "Gemma 3 27B 🆓" },
  { id: "qwen/qwen3-14b:free", label: "Qwen3 14B 🆓" },
  { id: "nvidia/nemotron-3-super-120b-a12b:free", label: "Nemotron 120B 🆓" },
  { id: "microsoft/phi-4-reasoning:free", label: "Phi-4 Reasoning 🆓" },
];

export async function startAddAgent(ctx: BotContext) {
  ctx.session.step = "aa:token";
  ctx.session.data = {};
  const kb = new InlineKeyboard().text("✕ Отмена", "wizard:cancel");
  await ctx.reply(
    `🤖 <b>Добавление агента</b>\n` +
    `<code>${prog(1)}</code>\n\n` +
    `<b>Шаг 1 из ${STEPS}: Токен бота</b>\n\n` +
    `Создай нового бота через @BotFather → /newbot\n` +
    `Скопируй токен (выглядит как <code>123456789:ABCdef...</code>) и отправь сюда:`,
    { parse_mode: "HTML", reply_markup: kb }
  );
}

export async function handleAddAgentStep(ctx: BotContext, text: string): Promise<boolean> {
  const step = ctx.session.step;
  const d = ctx.session.data as Record<string, unknown>;

  if (step === "aa:token") {
    const kb = new InlineKeyboard().text("✕ Отмена", "wizard:cancel");
    await ctx.reply("⏳ Проверяю токен у Telegram…", { parse_mode: "HTML", reply_markup: kb });
    try {
      const res = await fetch(`https://api.telegram.org/bot${text}/getMe`);
      const json = (await res.json()) as { ok: boolean; result?: { id: number; username?: string; first_name?: string } };
      if (!json.ok) {
        await ctx.reply(
          `❌ <b>Токен не принят.</b>\n\n` +
          `• Скопируй токен полностью (все символы)\n` +
          `• Формат: <code>1234567890:ABCdef...</code>\n` +
          `• Бот не должен быть удалён\n\n` +
          `Попробуй снова или нажми Отмена:`,
          { parse_mode: "HTML", reply_markup: kb }
        );
        return true;
      }
      const { id, username, first_name } = json.result!;
      d.botToken = text;
      d.botId = id;
      d.botUsername = username ?? "";
      d.name = first_name ?? `Agent${id}`;
      ctx.session.step = "aa:api_type";

      const apiKb = new InlineKeyboard()
        .text("⭐ FavoriteAPI (Gemini)", "aa:apitype:favorite").row()
        .text("🌐 OpenRouter (100+ моделей)", "aa:apitype:openrouter").row()
        .text("✕ Отмена", "wizard:cancel");

      await ctx.reply(
        `✅ Бот найден: <b>${first_name}</b> (@${username ?? id})\n\n` +
        `<code>${prog(2)}</code>\n` +
        `<b>Шаг 2 из ${STEPS}: Тип AI API</b>\n\n` +
        `⭐ <b>FavoriteAPI</b> — Gemini через прокси. Ключ: <code>fa_sk_...</code>\n` +
        `🌐 <b>OpenRouter</b> — 100+ моделей, есть бесплатные. Ключ: <code>sk-or-...</code>`,
        { parse_mode: "HTML", reply_markup: apiKb }
      );
    } catch {
      await ctx.reply("❌ Ошибка сети. Попробуй ещё раз:", { parse_mode: "HTML", reply_markup: kb });
    }
    return true;
  }

  if (step === "aa:api_key") {
    d.apiKey = text;
    if (d.apiType === "favorite") {
      ctx.session.step = "aa:api_url";
      const kb = new InlineKeyboard().text("✕ Отмена", "wizard:cancel");
      await ctx.reply(
        `<code>${prog(4)}</code>\n` +
        `<b>Шаг 4 из ${STEPS}: URL FavoriteAPI</b>\n\n` +
        `Введи базовый URL сервера FavoriteAPI.\n` +
        `Пример: <code>https://xxxx.trycloudflare.com</code>\n\n` +
        `💡 <i>Без слэша в конце. Это где запущен @SamGPTrobot.</i>`,
        { parse_mode: "HTML", reply_markup: kb }
      );
    } else {
      ctx.session.step = "aa:model";
      await showModelKb(ctx, "openrouter", 4);
    }
    return true;
  }

  if (step === "aa:api_url") {
    d.apiUrl = text.replace(/\/$/, "");
    ctx.session.step = "aa:model";
    await showModelKb(ctx, d.apiType as string, 5);
    return true;
  }

  if (step === "aa:prompt") {
    d.userPrompt = text === "-" ? null : text;
    ctx.session.step = "aa:chance";
    await showChanceKb(ctx);
    return true;
  }

  if (step === "aa:chance_custom") {
    const n = parseInt(text);
    if (isNaN(n) || n < 1 || n > 100) {
      await ctx.reply("❌ Введи число от 1 до 100:");
      return true;
    }
    d.responseChance = n;
    ctx.session.step = "aa:delay";
    await showDelayKb(ctx);
    return true;
  }

  return false;
}

async function showModelKb(ctx: BotContext, apiType: string, step: number) {
  const models = apiType === "favorite" ? FAVORITE_MODELS : OPENROUTER_MODELS;
  const kb = new InlineKeyboard();
  for (const m of models) kb.text(m.label, `aa:model:${m.id}`).row();
  kb.text("✕ Отмена", "wizard:cancel");

  await ctx.reply(
    `<code>${prog(step)}</code>\n` +
    `<b>Шаг ${step} из ${STEPS}: Модель ИИ</b>\n\n` +
    (apiType === "openrouter"
      ? "💡 Модели с 🆓 — <b>бесплатные</b>. DeepSeek V4 Flash — лучший бесплатный вариант."
      : "💡 <b>Thinking</b> — умнее и глубже. <b>Flash</b> — быстрее. Выбери под задачу."),
    { parse_mode: "HTML", reply_markup: kb }
  );
}

async function showChanceKb(ctx: BotContext) {
  const d = ctx.session.data as Record<string, unknown>;
  const kb = new InlineKeyboard()
    .text("100% — всегда", "aa:chance:100").text("80% — почти всегда", "aa:chance:80").row()
    .text("50% — через раз", "aa:chance:50").text("30% — редко", "aa:chance:30").row()
    .text("✏️ Своё значение", "aa:chance:custom").row()
    .text("✕ Отмена", "wizard:cancel");

  await ctx.reply(
    `<code>${prog(6)}</code>\n` +
    `<b>Шаг 6 из ${STEPS}: Шанс ответа</b>\n\n` +
    `С какой вероятностью агент отвечает на каждый пост?\n\n` +
    `💡 <i>Если несколько агентов в канале — ставь 50–80%, чтобы не все отвечали одновременно.</i>`,
    { parse_mode: "HTML", reply_markup: kb }
  );
}

async function showDelayKb(ctx: BotContext) {
  const kb = new InlineKeyboard()
    .text("⚡ Быстро (3–8 сек)", "aa:delay:3:8").row()
    .text("🚶 Нормально (8–20 сек)", "aa:delay:8:20").row()
    .text("🐢 Медленно (20–60 сек)", "aa:delay:20:60").row()
    .text("✕ Отмена", "wizard:cancel");

  await ctx.reply(
    `<code>${prog(7)}</code>\n` +
    `<b>Шаг 7 из ${STEPS}: Задержка перед ответом</b>\n\n` +
    `Агент ждёт случайное время из диапазона перед отправкой.\n` +
    `Это делает поведение более «человечным».`,
    { parse_mode: "HTML", reply_markup: kb }
  );
}

export async function handleApiTypeCallback(ctx: BotContext, apiType: string) {
  const d = ctx.session.data as Record<string, unknown>;
  d.apiType = apiType;
  ctx.session.step = "aa:api_key";

  const label = apiType === "favorite"
    ? `fa_sk_<i>64 символа hex</i>`
    : `sk-or-<i>...</i>`;

  const hint = apiType === "favorite"
    ? `Ключ для доступа к твоему FavoriteAPI-серверу.`
    : `Ключ с openrouter.ai. Бесплатный — лимит 20 запросов/мин.`;

  const kb = new InlineKeyboard().text("✕ Отмена", "wizard:cancel");
  await ctx.editMessageText(
    `<code>${prog(3)}</code>\n` +
    `<b>Шаг 3 из ${STEPS}: API ключ</b>\n\n` +
    `${hint}\n\n` +
    `Формат ключа: <code>${label}</code>\n\n` +
    `Отправь ключ в чат:`,
    { parse_mode: "HTML", reply_markup: kb }
  );
}

export async function handleModelCallback(ctx: BotContext, modelId: string) {
  const d = ctx.session.data as Record<string, unknown>;
  d.model = modelId;

  const isFav = d.apiType === "favorite";
  const stepNum = isFav ? 6 : 5;

  if (stepNum === 6) {
    // For favorite with url step already done
    ctx.session.step = "aa:prompt";
    const kb = new InlineKeyboard()
      .text("📝 Стандартный промпт", "aa:prompt:default").row()
      .text("✕ Отмена", "wizard:cancel");
    await ctx.editMessageText(
      `<code>${prog(5)}</code>\n` +
      `<b>Шаг 5 из ${STEPS}: Промпт агента</b>\n\n` +
      `Промпт — это инструкция: кем быть и как писать.\n\n` +
      `💡 <b>Стандартный</b> уже настроен и работает хорошо.\n` +
      `Или отправь свой промпт текстом в чат.\n` +
      `Прочерк <code>-</code> = стандартный.`,
      { parse_mode: "HTML", reply_markup: kb }
    );
  } else {
    ctx.session.step = "aa:prompt";
    const kb = new InlineKeyboard()
      .text("📝 Стандартный промпт", "aa:prompt:default").row()
      .text("✕ Отмена", "wizard:cancel");
    await ctx.editMessageText(
      `<code>${prog(5)}</code>\n` +
      `<b>Шаг 5 из ${STEPS}: Промпт агента</b>\n\n` +
      `Промпт — это инструкция для ИИ: кем быть и как писать.\n\n` +
      `💡 <b>Стандартный</b> промпт уже настроен — просто нажми кнопку.\n` +
      `Или напиши свой — например: <i>Ты технический эксперт, пишешь кратко и по делу.</i>`,
      { parse_mode: "HTML", reply_markup: kb }
    );
  }
}

export async function handlePromptDefault(ctx: BotContext) {
  const d = ctx.session.data as Record<string, unknown>;
  d.userPrompt = null;
  ctx.session.step = "aa:chance";
  await showChanceKb(ctx);
}

export async function handleChanceCallback(ctx: BotContext, value: string) {
  const d = ctx.session.data as Record<string, unknown>;
  if (value === "custom") {
    ctx.session.step = "aa:chance_custom";
    await ctx.editMessageText("Введи шанс ответа (число от 1 до 100):", { parse_mode: "HTML" });
    return;
  }
  d.responseChance = parseInt(value);
  ctx.session.step = "aa:delay";
  await showDelayKb(ctx);
}

export async function handleDelayCallback(ctx: BotContext, min: number, max: number) {
  const d = ctx.session.data as Record<string, unknown>;
  d.minDelaySec = min;
  d.maxDelaySec = max;
  ctx.session.step = "aa:confirm";
  await showAgentConfirm(ctx);
}

async function showAgentConfirm(ctx: BotContext) {
  const d = ctx.session.data as Record<string, unknown>;
  const apiLabel = d.apiType === "favorite" ? "⭐ FavoriteAPI" : "🌐 OpenRouter";
  const delayStr = `${d.minDelaySec}–${d.maxDelaySec} сек`;

  const text =
    `<code>${prog(8)}</code>\n` +
    `<b>Шаг 8 из ${STEPS}: Подтверждение</b>\n\n` +
    `📋 <b>Проверь данные агента:</b>\n\n` +
    `🤖 Имя: <b>${d.name}</b>\n` +
    `👤 @${d.botUsername}  ·  ID: <code>${d.botId}</code>\n` +
    `🔌 API: ${apiLabel}\n` +
    `🧠 Модель: <code>${d.model}</code>\n` +
    (d.apiUrl ? `🌐 URL: <code>${d.apiUrl}</code>\n` : "") +
    `🎲 Шанс: <b>${d.responseChance}%</b>\n` +
    `⏱ Задержка: <b>${delayStr}</b>\n` +
    (d.userPrompt ? `📝 Промпт: <i>кастомный</i>\n` : `📝 Промпт: стандартный\n`);

  const kb = new InlineKeyboard()
    .text("✅ Создать агента", "aa:confirm:yes").row()
    .text("✕ Отмена", "wizard:cancel");

  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: kb }).catch(() =>
      ctx.reply(text, { parse_mode: "HTML", reply_markup: kb })
    );
  } else {
    await ctx.reply(text, { parse_mode: "HTML", reply_markup: kb });
  }
}

export async function confirmCreateAgent(ctx: BotContext) {
  const d = ctx.session.data as Record<string, unknown>;

  await ctx.editMessageText("⏳ Создаю агента…", { parse_mode: "HTML" }).catch(() => {});

  const [agent] = await db.insert(agentsTable).values({
    name: d.name as string,
    botToken: d.botToken as string,
    botUsername: d.botUsername as string,
    botId: d.botId as number,
    apiType: d.apiType as string,
    apiKey: d.apiKey as string,
    apiUrl: (d.apiUrl as string | null) ?? null,
    model: d.model as string,
    userPrompt: (d.userPrompt as string | null) ?? null,
    responseChance: d.responseChance as number,
    minDelaySec: d.minDelaySec as number,
    maxDelaySec: d.maxDelaySec as number,
    active: true,
  }).returning();

  ctx.session.step = "idle";
  ctx.session.data = {};

  if (pollingManager.isEnabled()) {
    await pollingManager.startAgent({ id: agent!.id, botToken: agent!.botToken, active: true }, () => {});
  }

  await ctx.answerCallbackQuery("✅ Агент создан!");
  return showAgentInfo(ctx, agent!.id);
}
