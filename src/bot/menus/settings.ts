import { InlineKeyboard } from "grammy";
import type { BotContext } from "../index.js";
import { db, settingsTable } from "../../db/index.js";
import { eq } from "drizzle-orm";

async function send(ctx: BotContext, text: string, kb: InlineKeyboard) {
  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: kb }).catch(() =>
      ctx.reply(text, { parse_mode: "HTML", reply_markup: kb })
    );
  } else {
    await ctx.reply(text, { parse_mode: "HTML", reply_markup: kb });
  }
}

export async function showSettings(ctx: BotContext) {
  const rows = await db.select().from(settingsTable).limit(1);
  const s = rows[0];

  const favStatus = s?.favoriteApiUrl
    ? `🟢 <code>${s.favoriteApiUrl.slice(0, 50)}</code>`
    : "🔴 <i>Не задан</i>";

  const text =
    `⚙️ <b>Настройки</b>\n\n` +
    `<b>FavoriteAPI URL</b>\n${favStatus}\n` +
    `<i>Прокси-сервер для Gemini. Если используешь OpenRouter — не нужен.</i>\n\n` +
    `<b>Контекст сообщений:</b> <b>${s?.defaultContextMessages ?? 10}</b>\n` +
    `<i>Сколько предыдущих сообщений агент учитывает при ответе.</i>\n\n` +
    `<b>Режим отладки:</b> ${s?.debugMode ? "🟢 вкл" : "🔴 выкл"}`;

  const kb = new InlineKeyboard()
    .text("✏️ FavoriteAPI URL", "set:edit:fav_url").row()
    .text("✏️ Контекст сообщений", "set:edit:ctx_msgs").row()
    .text(s?.debugMode ? "🔴 Выкл отладку" : "🟢 Вкл отладку", "set:toggle:debug").row()
    .text("‹ Меню", "menu:main");

  return send(ctx, text, kb);
}

export async function getOrCreateSettings() {
  const rows = await db.select().from(settingsTable).limit(1);
  if (rows[0]) return rows[0];
  const [s] = await db.insert(settingsTable).values({}).returning();
  return s!;
}

export async function saveSettings(partial: Partial<{
  favoriteApiUrl: string | null;
  defaultContextMessages: number;
  debugMode: boolean;
}>) {
  const s = await getOrCreateSettings();
  await db.update(settingsTable).set({ ...partial, updatedAt: new Date() }).where(eq(settingsTable.id, s.id));
}

export async function toggleDebug(ctx: BotContext) {
  const s = await getOrCreateSettings();
  await saveSettings({ debugMode: !s.debugMode });
  await ctx.answerCallbackQuery(s.debugMode ? "🔴 Отладка выключена" : "🟢 Отладка включена");
  return showSettings(ctx);
}
