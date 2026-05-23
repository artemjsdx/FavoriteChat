import { InlineKeyboard } from "grammy";
import type { BotContext } from "../index.js";
import { db, agentsTable, channelsTable, settingsTable } from "../../db/index.js";
import { eq } from "drizzle-orm";
import { pollingManager } from "../../core/polling.js";

export function mainMenuKeyboard() {
  return new InlineKeyboard()
    .text("🤖 Агенты", "menu:agents").text("📡 Каналы", "menu:channels").row()
    .text("⚙️ Настройки", "menu:settings").text("📊 Статус", "menu:status").row()
    .text("❓ Помощь", "menu:help");
}

export async function mainMenuText(): Promise<string> {
  const [agents, channels, settings] = await Promise.all([
    db.select().from(agentsTable),
    db.select().from(channelsTable),
    db.select().from(settingsTable).limit(1),
  ]);

  const activeAgents = agents.filter((a) => a.active).length;
  const activeChannels = channels.filter((c) => c.active).length;

  const mode = pollingManager.isEnabled() ? "🔄 Polling" : "🌐 Webhook";
  const favOk = settings[0]?.favoriteApiUrl ? "⭐ FavoriteAPI" : "🌐 OpenRouter";

  let statusLine = "";
  if (agents.length === 0 && channels.length === 0) {
    statusLine = "\n⚡ <i>Начни с добавления агента — нажми «🤖 Агенты»</i>";
  } else {
    const aParts = activeAgents === agents.length
      ? `${agents.length} 🟢`
      : `${activeAgents}/${agents.length} 🟢`;
    const cParts = activeChannels === channels.length
      ? `${channels.length} 🟢`
      : `${activeChannels}/${channels.length} 🟢`;
    statusLine = `\n📈 Агентов: <b>${aParts}</b>  ·  Каналов: <b>${cParts}</b>`;
  }

  return (
    `⚡ <b>FavoriteChat</b>` +
    statusLine +
    `\n🔧 ${mode}  ·  ${favOk}`
  );
}

export async function showMainMenu(ctx: BotContext, edit = false) {
  const text = await mainMenuText();
  const kb = mainMenuKeyboard();
  if (edit && ctx.callbackQuery) {
    await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: kb }).catch(() => {});
  } else {
    await ctx.reply(text, { parse_mode: "HTML", reply_markup: kb });
  }
}
