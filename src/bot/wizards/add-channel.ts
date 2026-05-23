import { InlineKeyboard } from "grammy";
import type { BotContext } from "../index.js";
import { db, channelsTable } from "../../db/index.js";
import { showChannelInfo } from "../menus/channels.js";

const STEPS = 4;
function prog(step: number): string {
  return Array.from({ length: STEPS }, (_, i) => (i < step ? "●" : "○")).join(" ");
}

export async function startAddChannel(ctx: BotContext) {
  ctx.session.step = "ac:chat_id";
  ctx.session.data = {};

  const kb = new InlineKeyboard().text("✕ Отмена", "wizard:cancel");
  await ctx.reply(
    `📡 <b>Добавление канала</b>\n` +
    `<code>${prog(1)}</code>\n\n` +
    `<b>Шаг 1 из ${STEPS}: Chat ID канала</b>\n\n` +
    `💡 <b>Как узнать Chat ID:</b>\n` +
    `1. Перешли любой пост из канала боту @userinfobot\n` +
    `2. Бот покажет <code>Chat: -1001234567890</code>\n` +
    `3. Скопируй это число с минусом\n\n` +
    `Введи Chat ID:`,
    { parse_mode: "HTML", reply_markup: kb }
  );
}

export async function handleAddChannelStep(ctx: BotContext, text: string): Promise<boolean> {
  const step = ctx.session.step;
  const d = ctx.session.data as Record<string, unknown>;
  const kb = new InlineKeyboard().text("✕ Отмена", "wizard:cancel");

  if (step === "ac:chat_id") {
    if (!/^-?\d+$/.test(text)) {
      await ctx.reply(
        `❌ <b>Неверный формат.</b>\n\n` +
        `Chat ID — это число, например: <code>-1001234567890</code>\n\n` +
        `💡 Перешли пост из канала → @userinfobot → скопируй Chat ID\n\n` +
        `Попробуй ещё раз:`,
        { parse_mode: "HTML", reply_markup: kb }
      );
      return true;
    }
    d.chatId = text;
    ctx.session.step = "ac:group_id";

    const skipKb = new InlineKeyboard()
      .text("➡️ Пропустить (без комментариев)", "ac:skip_group").row()
      .text("✕ Отмена", "wizard:cancel");

    await ctx.reply(
      `<code>${prog(2)}</code>\n` +
      `<b>Шаг 2 из ${STEPS}: Group ID (группа комментариев)</b>\n\n` +
      `Это ID группы, куда агент пишет комментарии.\n\n` +
      `💡 <b>Как узнать Group ID:</b>\n` +
      `1. Настройки канала → Обсуждения\n` +
      `2. Открой группу, перешли сообщение → @userinfobot\n\n` +
      `⚠️ <i>Без Group ID агент не сможет писать комментарии!</i>\n\n` +
      `Введи Group ID или нажми «Пропустить»:`,
      { parse_mode: "HTML", reply_markup: skipKb }
    );
    return true;
  }

  if (step === "ac:group_id") {
    if (!/^-?\d+$/.test(text)) {
      const skipKb = new InlineKeyboard()
        .text("➡️ Пропустить", "ac:skip_group").row()
        .text("✕ Отмена", "wizard:cancel");
      await ctx.reply(
        `❌ Неверный формат. Group ID — число, например: <code>-1009876543210</code>`,
        { parse_mode: "HTML", reply_markup: skipKb }
      );
      return true;
    }
    d.groupId = text;
    ctx.session.step = "ac:title";
    await ctx.reply(
      `<code>${prog(3)}</code>\n` +
      `<b>Шаг 3 из ${STEPS}: Название канала</b>\n\n` +
      `Только для отображения в боте. Например: <i>Мой крипто-канал</i>`,
      { parse_mode: "HTML", reply_markup: kb }
    );
    return true;
  }

  if (step === "ac:title") {
    d.title = text;
    ctx.session.step = "ac:confirm";
    await showChannelConfirm(ctx);
    return true;
  }

  return false;
}

export async function skipGroupId(ctx: BotContext) {
  const d = ctx.session.data as Record<string, unknown>;
  d.groupId = null;
  ctx.session.step = "ac:title";
  const kb = new InlineKeyboard().text("✕ Отмена", "wizard:cancel");
  await ctx.editMessageText(
    `<code>${prog(3)}</code>\n` +
    `<b>Шаг 3 из ${STEPS}: Название канала</b>\n\n` +
    `Только для отображения в боте. Например: <i>Мой крипто-канал</i>`,
    { parse_mode: "HTML", reply_markup: kb }
  );
}

async function showChannelConfirm(ctx: BotContext) {
  const d = ctx.session.data as Record<string, unknown>;
  const text =
    `<code>${prog(4)}</code>\n` +
    `<b>Шаг 4 из ${STEPS}: Подтверждение</b>\n\n` +
    `📋 <b>Проверь данные канала:</b>\n\n` +
    `📡 Название: <b>${d.title}</b>\n` +
    `🆔 Chat ID: <code>${d.chatId}</code>\n` +
    `💬 Group ID: ${d.groupId ? `<code>${d.groupId}</code>` : "<i>не задан</i> ⚠️"}`;

  const kb = new InlineKeyboard()
    .text("✅ Добавить канал", "ac:confirm:yes").row()
    .text("✕ Отмена", "wizard:cancel");

  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: kb }).catch(() =>
      ctx.reply(text, { parse_mode: "HTML", reply_markup: kb })
    );
  } else {
    await ctx.reply(text, { parse_mode: "HTML", reply_markup: kb });
  }
}

export async function confirmCreateChannel(ctx: BotContext) {
  const d = ctx.session.data as Record<string, unknown>;

  await ctx.editMessageText("⏳ Создаю канал…", { parse_mode: "HTML" }).catch(() => {});

  const [channel] = await db.insert(channelsTable).values({
    telegramChatId: d.chatId as string,
    linkedGroupId: (d.groupId as string | null) ?? null,
    title: d.title as string,
    active: true,
  }).returning();

  ctx.session.step = "idle";
  ctx.session.data = {};

  await ctx.answerCallbackQuery("✅ Канал добавлен!");
  return showChannelInfo(ctx, channel!.id);
}
