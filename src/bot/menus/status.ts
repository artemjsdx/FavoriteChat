import { InlineKeyboard } from "grammy";
import type { BotContext } from "../index.js";
import { db, agentsTable, channelsTable, channelAgentsTable, messagesTable, settingsTable } from "../../db/index.js";
import { eq, desc, gte } from "drizzle-orm";
import { pollingManager } from "../../core/polling.js";

async function send(ctx: BotContext, text: string, kb: InlineKeyboard) {
  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: kb }).catch(() =>
      ctx.reply(text, { parse_mode: "HTML", reply_markup: kb })
    );
  } else {
    await ctx.reply(text, { parse_mode: "HTML", reply_markup: kb });
  }
}

async function pingFavoriteApi(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/api/models`, { signal: AbortSignal.timeout(5_000) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function showStatus(ctx: BotContext) {
  const [agents, channels, bindings, settingsRows] = await Promise.all([
    db.select().from(agentsTable),
    db.select().from(channelsTable),
    db.select().from(channelAgentsTable),
    db.select().from(settingsTable).limit(1),
  ]);

  const s = settingsRows[0];
  const activeAgents = agents.filter((a) => a.active).length;
  const activeChannels = channels.filter((c) => c.active).length;

  const pollingStatus = pollingManager.isEnabled() ? "🟢 Polling активен" : "🔵 Webhook режим";

  let favStatus = "⚫ <i>URL не задан</i>";
  if (s?.favoriteApiUrl) {
    const ok = await pingFavoriteApi(s.favoriteApiUrl);
    favStatus = ok ? "🟢 Доступен" : "🔴 Недоступен";
  }

  // Last 24h messages
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const recentMsgs = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.isAgent, true));

  const today = recentMsgs.filter((m) => m.createdAt > since).length;
  const lastMsg = await db.select().from(messagesTable)
    .where(eq(messagesTable.isAgent, true))
    .orderBy(desc(messagesTable.createdAt))
    .limit(1);

  let lastMsgStr = "—";
  if (lastMsg[0]) {
    const diffMs = Date.now() - lastMsg[0].createdAt.getTime();
    const diffMin = Math.floor(diffMs / 60_000);
    if (diffMin < 1) lastMsgStr = "только что";
    else if (diffMin < 60) lastMsgStr = `${diffMin} мин назад`;
    else lastMsgStr = `${Math.floor(diffMin / 60)} ч назад`;
  }

  let agentList = "";
  for (const a of agents) {
    const ico = a.active ? "🟢" : "🔴";
    const bound = bindings.filter((b) => b.agentId === a.id).length;
    agentList += `  ${ico} <b>${a.name}</b> · @${a.botUsername} · 📡 ${bound}\n`;
  }

  let channelList = "";
  for (const ch of channels) {
    const ico = ch.active ? "🟢" : "🔴";
    const cnt = bindings.filter((b) => b.channelId === ch.id && b.active).length;
    channelList += `  ${ico} <b>${ch.title}</b> · 🤖 ${cnt}\n`;
  }

  const text =
    `📊 <b>Статус системы</b>\n\n` +
    `🔄 ${pollingStatus}\n` +
    `⭐ FavoriteAPI: ${favStatus}\n` +
    `💬 Ответов сегодня: <b>${today}</b>\n` +
    `⏱ Последний ответ: ${lastMsgStr}\n\n` +
    `<b>Агенты (${agents.length}):</b>\n` +
    (agentList || "  <i>нет</i>") + "\n" +
    `<b>Каналы (${channels.length}):</b>\n` +
    (channelList || "  <i>нет</i>");

  const kb = new InlineKeyboard()
    .text("🔄 Обновить", "menu:status")
    .text("‹ Меню", "menu:main");

  return send(ctx, text, kb);
}
