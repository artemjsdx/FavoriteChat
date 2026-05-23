import { InlineKeyboard } from "grammy";
import type { BotContext } from "../index.js";
import { db, agentsTable } from "../../db/index.js";
import { eq } from "drizzle-orm";
import { showAgentInfo } from "../menus/agents.js";

async function send(ctx: BotContext, text: string, kb: InlineKeyboard) {
  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: kb }).catch(() =>
      ctx.reply(text, { parse_mode: "HTML", reply_markup: kb })
    );
  } else {
    await ctx.reply(text, { parse_mode: "HTML", reply_markup: kb });
  }
}

export async function showEditMenu(ctx: BotContext, agentId: number) {
  const [a] = await db.select().from(agentsTable).where(eq(agentsTable.id, agentId));
  if (!a) return ctx.answerCallbackQuery("❌ Агент не найден");

  const kb = new InlineKeyboard()
    .text("📝 Промпт", `edit:prompt:${agentId}`).text("🎲 Шанс", `edit:chance:${agentId}`).row()
    .text("⏱ Задержка", `edit:delay:${agentId}`).text("🔑 API ключ", `edit:api_key:${agentId}`).row()
    .text("🧠 Модель", `edit:model:${agentId}`).row()
    .text("‹ Назад", `agent:info:${agentId}`);

  return send(
    ctx,
    `✏️ <b>Изменить агента ${a.name}</b>\n\nЧто хочешь изменить?`,
    kb
  );
}

export async function startEditField(ctx: BotContext, agentId: number, field: string) {
  ctx.session.step = `edit:${field}`;
  ctx.session.data = { agentId };

  const [a] = await db.select().from(agentsTable).where(eq(agentsTable.id, agentId));
  if (!a) return ctx.answerCallbackQuery("❌ Не найдено");

  const kb = new InlineKeyboard().text("✕ Отмена", `agent:info:${agentId}`);

  if (field === "prompt") {
    const current = a.userPrompt ? `<i>${a.userPrompt.slice(0, 100)}…</i>` : "<i>стандартный</i>";
    const useDefaultKb = new InlineKeyboard()
      .text("↩️ Использовать стандартный", `edit:prompt_default:${agentId}`).row()
      .text("✕ Отмена", `agent:info:${agentId}`);
    return send(
      ctx,
      `📝 <b>Промпт агента ${a.name}</b>\n\nТекущий: ${current}\n\nОтправь новый промпт или выбери стандартный:`,
      useDefaultKb
    );
  }

  if (field === "chance") {
    const chanceKb = new InlineKeyboard()
      .text("100%", `edit:chance_val:${agentId}:100`).text("80%", `edit:chance_val:${agentId}:80`).row()
      .text("50%", `edit:chance_val:${agentId}:50`).text("30%", `edit:chance_val:${agentId}:30`).row()
      .text("✕ Отмена", `agent:info:${agentId}`);
    return send(
      ctx,
      `🎲 <b>Шанс ответа</b>\n\nТекущий: <b>${a.responseChance}%</b>\n\nВыбери новый:`,
      chanceKb
    );
  }

  if (field === "delay") {
    const delayKb = new InlineKeyboard()
      .text("⚡ 3–8 сек", `edit:delay_val:${agentId}:3:8`).row()
      .text("🚶 8–20 сек", `edit:delay_val:${agentId}:8:20`).row()
      .text("🐢 20–60 сек", `edit:delay_val:${agentId}:20:60`).row()
      .text("✕ Отмена", `agent:info:${agentId}`);
    return send(
      ctx,
      `⏱ <b>Задержка перед ответом</b>\n\nТекущая: <b>${a.minDelaySec}–${a.maxDelaySec} сек</b>\n\nВыбери новую:`,
      delayKb
    );
  }

  if (field === "api_key") {
    return send(ctx, `🔑 <b>Новый API ключ</b>\n\nОтправь новый ключ в чат:`, kb);
  }

  if (field === "model") {
    const MODELS_FAV = [
      { id: "gemini-3.0-flash-thinking", label: "Gemini 3.0 Flash Thinking 🧠" },
      { id: "gemini-3.0-flash", label: "Gemini 3.0 Flash ⚡" },
      { id: "gemini-2.5-flash-thinking", label: "Gemini 2.5 Flash Thinking 🧠" },
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash ⚡" },
    ];
    const MODELS_OR = [
      { id: "deepseek/deepseek-v4-flash:free", label: "DeepSeek V4 Flash 🆓" },
      { id: "meta-llama/llama-4-scout:free", label: "Llama 4 Scout 🆓" },
      { id: "google/gemma-3-27b-it:free", label: "Gemma 3 27B 🆓" },
    ];
    const models = a.apiType === "favorite" ? MODELS_FAV : MODELS_OR;
    const modelKb = new InlineKeyboard();
    for (const m of models) modelKb.text(m.label, `edit:model_val:${agentId}:${m.id}`).row();
    modelKb.text("✕ Отмена", `agent:info:${agentId}`);
    return send(ctx, `🧠 <b>Модель ИИ</b>\n\nТекущая: <code>${a.model}</code>\n\nВыбери новую:`, modelKb);
  }
}

export async function handleEditStep(ctx: BotContext, text: string): Promise<boolean> {
  const step = ctx.session.step;
  const d = ctx.session.data as Record<string, unknown>;
  const agentId = d.agentId as number;

  if (step === "edit:prompt") {
    await db.update(agentsTable).set({ userPrompt: text, updatedAt: new Date() }).where(eq(agentsTable.id, agentId));
    ctx.session.step = "idle";
    await ctx.reply("✅ Промпт обновлён.");
    return showAgentInfo(ctx, agentId).then(() => true);
  }

  if (step === "edit:api_key") {
    await db.update(agentsTable).set({ apiKey: text, updatedAt: new Date() }).where(eq(agentsTable.id, agentId));
    ctx.session.step = "idle";
    await ctx.reply("✅ API ключ обновлён.");
    return showAgentInfo(ctx, agentId).then(() => true);
  }

  return false;
}

export async function applyEditCallback(ctx: BotContext, agentId: number, field: string, ...values: string[]) {
  let updateData: Partial<typeof agentsTable.$inferInsert> = { updatedAt: new Date() };

  if (field === "chance_val") updateData.responseChance = parseInt(values[0]!);
  if (field === "delay_val") { updateData.minDelaySec = parseInt(values[0]!); updateData.maxDelaySec = parseInt(values[1]!); }
  if (field === "model_val") updateData.model = values.join(":");
  if (field === "prompt_default") updateData.userPrompt = null;

  await db.update(agentsTable).set(updateData).where(eq(agentsTable.id, agentId));
  ctx.session.step = "idle";
  await ctx.answerCallbackQuery("✅ Сохранено");
  return showAgentInfo(ctx, agentId);
}
