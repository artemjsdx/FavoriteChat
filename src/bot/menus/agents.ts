import { InlineKeyboard } from "grammy";
import type { BotContext } from "../index.js";
import { db, agentsTable, channelsTable, channelAgentsTable } from "../../db/index.js";
import { eq, and } from "drizzle-orm";
import { pollingManager } from "../../core/polling.js";

const API_LABELS: Record<string, string> = {
  favorite: "⭐ FavoriteAPI",
  openrouter: "🌐 OpenRouter",
};

function prog(step: number, total: number): string {
  return Array.from({ length: total }, (_, i) => (i < step ? "●" : "○")).join(" ");
}

export async function showAgentsList(ctx: BotContext) {
  const agents = await db.select().from(agentsTable).orderBy(agentsTable.createdAt);

  const kb = new InlineKeyboard();

  if (agents.length === 0) {
    kb.text("➕ Добавить первого агента", "wizard:add_agent").row()
      .text("‹ Меню", "menu:main");
    const text =
      `🤖 <b>Агенты</b>\n\n` +
      `Агент — это Telegram-бот, который автоматически пишет\n` +
      `комментарии под постами в твоих каналах.\n\n` +
      `<b>Что нужно для создания агента:</b>\n` +
      `• Токен бота от @BotFather\n` +
      `• Ключ FavoriteAPI или OpenRouter\n\n` +
      `<i>Агентов пока нет. Создай первого!</i>`;
    return send(ctx, text, kb);
  }

  const bindings = await db.select().from(channelAgentsTable);

  let text = `🤖 <b>Агенты</b> (${agents.length})\n<i>Выбери агента для управления</i>\n\n`;

  for (const a of agents) {
    const ico = a.active ? "🟢" : "🔴";
    const bound = bindings.filter((b) => b.agentId === a.id).length;
    const api = API_LABELS[a.apiType] ?? a.apiType;
    text += `${ico} <b>${a.name}</b> · @${a.botUsername}\n`;
    text += `   ${api} · ${a.responseChance}% · 📡 ${bound} канал(а)\n\n`;
    kb.text(`${ico} ${a.name}`, `agent:info:${a.id}`).row();
  }

  kb.text("➕ Добавить агента", "wizard:add_agent").row()
    .text("‹ Меню", "menu:main");

  return send(ctx, text, kb);
}

export async function showAgentInfo(ctx: BotContext, agentId: number) {
  const [a] = await db.select().from(agentsTable).where(eq(agentsTable.id, agentId));
  if (!a) return ctx.answerCallbackQuery("❌ Агент не найден");

  const bindings = await db
    .select({ channelId: channelAgentsTable.channelId })
    .from(channelAgentsTable)
    .where(and(eq(channelAgentsTable.agentId, agentId)));

  const channelIds = bindings.map((b) => b.channelId);
  let channelInfo = "<i>Не привязан ни к одному каналу</i>";
  if (channelIds.length > 0) {
    const channels = await db.select().from(channelsTable).where(
      // in operator
      eq(channelsTable.id, channelIds[0]!)
    );
    // simple for loop
    const parts: string[] = [];
    for (const id of channelIds) {
      const ch = await db.select().from(channelsTable).where(eq(channelsTable.id, id));
      if (ch[0]) parts.push(`  📡 ${ch[0].title} ${ch[0].active ? "🟢" : "🔴"}`);
    }
    if (parts.length) channelInfo = parts.join("\n");
  }

  const ico = a.active ? "🟢" : "🔴";
  const api = API_LABELS[a.apiType] ?? a.apiType;
  const delay = `${a.minDelaySec}–${a.maxDelaySec} сек`;

  const text =
    `🤖 <b>${a.name}</b> ${ico}\n\n` +
    `👤 @${a.botUsername}  ·  ID: <code>${a.botId ?? "—"}</code>\n` +
    `🔌 ${api}\n` +
    `🧠 Модель: <code>${a.model}</code>\n` +
    `🎲 Шанс ответа: <b>${a.responseChance}%</b>\n` +
    `⏱ Задержка: <b>${delay}</b>\n\n` +
    `<b>Каналы:</b>\n${channelInfo}\n\n` +
    (a.userPrompt
      ? `<b>Промпт:</b>\n<i>${a.userPrompt.slice(0, 150)}${a.userPrompt.length > 150 ? "…" : ""}</i>`
      : `<b>Промпт:</b> <i>стандартный</i>`);

  const toggleLabel = a.active ? "⏸ Выключить" : "▶️ Включить";
  const kb = new InlineKeyboard()
    .text(toggleLabel, `agent:toggle:${a.id}`).text("✏️ Изменить", `agent:edit:${a.id}`).row()
    .text("🧪 Тест", `agent:test:${a.id}`).text("🗑 Удалить", `agent:delete:${a.id}`).row()
    .text("‹ Агенты", "menu:agents");

  return send(ctx, text, kb);
}

export async function toggleAgent(ctx: BotContext, agentId: number) {
  const [a] = await db.select().from(agentsTable).where(eq(agentsTable.id, agentId));
  if (!a) return ctx.answerCallbackQuery("❌ Не найдено");

  const newActive = !a.active;
  await db.update(agentsTable).set({ active: newActive, updatedAt: new Date() }).where(eq(agentsTable.id, agentId));

  if (pollingManager.isEnabled()) {
    if (newActive) await pollingManager.startAgent({ ...a, active: true }, () => {});
    else await pollingManager.stopAgent(agentId);
  }

  await ctx.answerCallbackQuery(newActive ? `✅ ${a.name} включён` : `⏸ ${a.name} выключен`);
  return showAgentInfo(ctx, agentId);
}

export async function confirmDeleteAgent(ctx: BotContext, agentId: number) {
  const [a] = await db.select().from(agentsTable).where(eq(agentsTable.id, agentId));
  if (!a) return ctx.answerCallbackQuery("❌ Не найдено");

  const kb = new InlineKeyboard()
    .text("🗑 Да, удалить навсегда", `agent:delete_confirm:${agentId}`)
    .text("✕ Отмена", `agent:info:${agentId}`);

  const text =
    `⚠️ <b>Удалить агента?</b>\n\n` +
    `<b>${a.name}</b> (@${a.botUsername}) будет удалён.\n` +
    `Все привязки к каналам тоже удалятся.\n\n` +
    `<i>Это действие нельзя отменить.</i>`;

  return send(ctx, text, kb);
}

export async function doDeleteAgent(ctx: BotContext, agentId: number) {
  const [a] = await db.select().from(agentsTable).where(eq(agentsTable.id, agentId));
  if (!a) return ctx.answerCallbackQuery("❌ Не найдено");

  if (pollingManager.isEnabled()) await pollingManager.stopAgent(agentId);
  await db.delete(channelAgentsTable).where(eq(channelAgentsTable.agentId, agentId));
  await db.delete(agentsTable).where(eq(agentsTable.id, agentId));

  await ctx.answerCallbackQuery(`🗑 ${a.name} удалён`);
  return showAgentsList(ctx);
}

async function send(ctx: BotContext, text: string, kb: InlineKeyboard) {
  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: kb }).catch(() =>
      ctx.reply(text, { parse_mode: "HTML", reply_markup: kb })
    );
  } else {
    await ctx.reply(text, { parse_mode: "HTML", reply_markup: kb });
  }
}

export { prog };
