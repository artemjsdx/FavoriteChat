import { InlineKeyboard } from "grammy";
import type { BotContext } from "../index.js";
import { db, channelsTable, channelAgentsTable, agentsTable } from "../../db/index.js";
import { eq, and } from "drizzle-orm";

async function send(ctx: BotContext, text: string, kb: InlineKeyboard) {
  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: kb }).catch(() =>
      ctx.reply(text, { parse_mode: "HTML", reply_markup: kb })
    );
  } else {
    await ctx.reply(text, { parse_mode: "HTML", reply_markup: kb });
  }
}

export async function showChannelsList(ctx: BotContext) {
  const channels = await db.select().from(channelsTable).orderBy(channelsTable.createdAt);
  const kb = new InlineKeyboard();

  if (channels.length === 0) {
    kb.text("➕ Добавить канал", "wizard:add_channel").row()
      .text("‹ Меню", "menu:main");
    const text =
      `📡 <b>Каналы</b>\n\n` +
      `Каналы — это Telegram-каналы, за которыми следят агенты.\n` +
      `Они пишут комментарии в группе обсуждений под каждым постом.\n\n` +
      `<b>Что нужно для добавления:</b>\n` +
      `• <b>Chat ID канала</b> — перешли пост боту @userinfobot\n` +
      `• <b>Group ID</b> — ID группы комментариев (Обсуждения)\n\n` +
      `<i>Каналов пока нет.</i>`;
    return send(ctx, text, kb);
  }

  const bindings = await db.select().from(channelAgentsTable);

  let text = `📡 <b>Каналы</b> (${channels.length})\n<i>Выбери канал для управления</i>\n\n`;

  for (const ch of channels) {
    const ico = ch.active ? "🟢" : "🔴";
    const count = bindings.filter((b) => b.channelId === ch.id && b.active).length;
    const warn = !ch.linkedGroupId ? " ⚠️" : "";
    text += `${ico} <b>${ch.title}</b>${warn}\n`;
    text += `   ID: <code>${ch.telegramChatId}</code> · 🤖 ${count}\n\n`;
    kb.text(`${ico} ${ch.title}${warn}`, `ch:info:${ch.id}`).row();
  }

  kb.text("➕ Добавить канал", "wizard:add_channel").row()
    .text("‹ Меню", "menu:main");

  return send(ctx, text, kb);
}

export async function showChannelInfo(ctx: BotContext, channelId: number) {
  const [ch] = await db.select().from(channelsTable).where(eq(channelsTable.id, channelId));
  if (!ch) return ctx.answerCallbackQuery("❌ Канал не найден");

  const bindings = await db.select().from(channelAgentsTable).where(eq(channelAgentsTable.channelId, channelId));
  const allAgents = await db.select().from(agentsTable);
  const bound = allAgents.filter((a) => bindings.some((b) => b.agentId === a.id));

  let agentSection = "\n<i>Нет привязанных агентов ⚠️</i>";
  if (bound.length > 0) {
    agentSection = "\n<b>Агенты:</b>\n";
    for (const a of bound) {
      const b = bindings.find((x) => x.agentId === a.id)!;
      const ico = a.active && b.active ? "🟢" : "🔴";
      agentSection += `  ${ico} <b>${a.name}</b> · @${a.botUsername}\n`;
    }
  }

  const ico = ch.active ? "🟢" : "🔴";
  const grpStatus = ch.linkedGroupId
    ? `<code>${ch.linkedGroupId}</code>`
    : `<i>не задан</i> ⚠️`;

  const text =
    `📡 <b>${ch.title}</b> ${ico}\n\n` +
    `🆔 Chat ID: <code>${ch.telegramChatId}</code>\n` +
    `💬 Group ID: ${grpStatus}\n` +
    `📝 Контекст: <b>${ch.contextMessages}</b> сообщений\n` +
    agentSection;

  const toggleLabel = ch.active ? "⏸ Выключить" : "▶️ Включить";
  const kb = new InlineKeyboard()
    .text(toggleLabel, `ch:toggle:${channelId}`).row()
    .text("➕ Привязать агента", `ch:bind:${channelId}`).row();

  if (bound.length > 0) {
    kb.text("➖ Отвязать агента", `ch:unbind_list:${channelId}`).row();
  }

  kb.text("🗑 Удалить канал", `ch:delete:${channelId}`).row()
    .text("‹ Каналы", "menu:channels");

  return send(ctx, text, kb);
}

export async function toggleChannel(ctx: BotContext, channelId: number) {
  const [ch] = await db.select().from(channelsTable).where(eq(channelsTable.id, channelId));
  if (!ch) return ctx.answerCallbackQuery("❌ Не найдено");

  const newActive = !ch.active;
  await db.update(channelsTable).set({ active: newActive }).where(eq(channelsTable.id, channelId));
  await ctx.answerCallbackQuery(newActive ? `✅ ${ch.title} включён` : `⏸ ${ch.title} выключен`);
  return showChannelInfo(ctx, channelId);
}

export async function showBindList(ctx: BotContext, channelId: number) {
  const [ch] = await db.select().from(channelsTable).where(eq(channelsTable.id, channelId));
  if (!ch) return ctx.answerCallbackQuery("❌ Не найдено");

  const already = await db.select().from(channelAgentsTable).where(eq(channelAgentsTable.channelId, channelId));
  const alreadyIds = already.map((x) => x.agentId);
  const allAgents = await db.select().from(agentsTable);
  const free = allAgents.filter((a) => !alreadyIds.includes(a.id));

  if (allAgents.length === 0) {
    const kb = new InlineKeyboard().text("➕ Создать агента", "wizard:add_agent").row().text("‹ Назад", `ch:info:${channelId}`);
    return send(ctx, "🤖 Агентов пока нет. Сначала создай агента.", kb);
  }

  if (free.length === 0) {
    const kb = new InlineKeyboard().text("‹ Назад", `ch:info:${channelId}`);
    return send(ctx, "✅ Все агенты уже привязаны к этому каналу.", kb);
  }

  const kb = new InlineKeyboard();
  for (const a of free) {
    const ico = a.active ? "🟢" : "🔴";
    kb.text(`${ico} ${a.name} · @${a.botUsername}`, `ch:do_bind:${channelId}:${a.id}`).row();
  }
  kb.text("✕ Отмена", `ch:info:${channelId}`);

  return send(ctx, `➕ <b>Привязать агента к «${ch.title}»</b>\n\nВыбери агента:`, kb);
}

export async function doBind(ctx: BotContext, channelId: number, agentId: number) {
  const [ch] = await db.select().from(channelsTable).where(eq(channelsTable.id, channelId));
  const [ag] = await db.select().from(agentsTable).where(eq(agentsTable.id, agentId));
  if (!ch || !ag) return ctx.answerCallbackQuery("❌ Не найдено");

  const existing = await db.select().from(channelAgentsTable).where(
    and(eq(channelAgentsTable.channelId, channelId), eq(channelAgentsTable.agentId, agentId))
  );

  if (existing.length === 0) {
    await db.insert(channelAgentsTable).values({ channelId, agentId });
  }

  await ctx.answerCallbackQuery(`✅ ${ag.name} привязан`);

  let extra = "";
  if (!ag.active) extra += "\n\n⚠️ <i>Агент выключен. Включи его в разделе «Агенты».</i>";
  if (!ch.linkedGroupId) extra += "\n\n⚠️ <i>У канала не задан Group ID — агент не сможет писать. Добавь Group ID.</i>";

  const kb = new InlineKeyboard().text("‹ К каналу", `ch:info:${channelId}`).text("🤖 Агенты", "menu:agents");
  return send(ctx, `✅ <b>${ag.name}</b> привязан к <b>${ch.title}</b>!${extra}`, kb);
}

export async function showUnbindList(ctx: BotContext, channelId: number) {
  const [ch] = await db.select().from(channelsTable).where(eq(channelsTable.id, channelId));
  if (!ch) return ctx.answerCallbackQuery("❌ Не найдено");

  const bindings = await db.select().from(channelAgentsTable).where(eq(channelAgentsTable.channelId, channelId));
  const allAgents = await db.select().from(agentsTable);
  const myAgents = allAgents.filter((a) => bindings.some((b) => b.agentId === a.id));

  if (myAgents.length === 0) {
    return showChannelInfo(ctx, channelId);
  }

  const kb = new InlineKeyboard();
  for (const a of myAgents) {
    kb.text(`❌ ${a.name} · @${a.botUsername}`, `ch:do_unbind:${channelId}:${a.id}`).row();
  }
  kb.text("✕ Отмена", `ch:info:${channelId}`);

  return send(ctx, `➖ <b>Отвязать агента от «${ch.title}»</b>\n\nВыбери агента:`, kb);
}

export async function doUnbind(ctx: BotContext, channelId: number, agentId: number) {
  const [ag] = await db.select().from(agentsTable).where(eq(agentsTable.id, agentId));
  await db.delete(channelAgentsTable).where(
    and(eq(channelAgentsTable.channelId, channelId), eq(channelAgentsTable.agentId, agentId))
  );
  await ctx.answerCallbackQuery(ag ? `➖ ${ag.name} отвязан` : "➖ Отвязан");
  return showChannelInfo(ctx, channelId);
}

export async function confirmDeleteChannel(ctx: BotContext, channelId: number) {
  const [ch] = await db.select().from(channelsTable).where(eq(channelsTable.id, channelId));
  if (!ch) return ctx.answerCallbackQuery("❌ Не найдено");

  const kb = new InlineKeyboard()
    .text("🗑 Да, удалить", `ch:delete_confirm:${channelId}`)
    .text("✕ Отмена", `ch:info:${channelId}`);

  return send(
    ctx,
    `⚠️ <b>Удалить канал?</b>\n\n<b>${ch.title}</b> и все привязки агентов будут удалены.\n<i>Нельзя отменить.</i>`,
    kb
  );
}

export async function doDeleteChannel(ctx: BotContext, channelId: number) {
  const [ch] = await db.select().from(channelsTable).where(eq(channelsTable.id, channelId));
  if (!ch) return ctx.answerCallbackQuery("❌ Не найдено");

  await db.delete(channelAgentsTable).where(eq(channelAgentsTable.channelId, channelId));
  await db.delete(channelsTable).where(eq(channelsTable.id, channelId));
  await ctx.answerCallbackQuery(`🗑 ${ch.title} удалён`);
  return showChannelsList(ctx);
}
