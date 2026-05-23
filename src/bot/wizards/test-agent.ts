import { InlineKeyboard } from "grammy";
import type { BotContext } from "../index.js";
import { db, agentsTable } from "../../db/index.js";
import { eq } from "drizzle-orm";
import { callAI, type ChatMessage } from "../../core/ai-clients.js";
import { parseTags } from "../../core/tags.js";

export async function startTestAgent(ctx: BotContext, agentId: number) {
  const [a] = await db.select().from(agentsTable).where(eq(agentsTable.id, agentId));
  if (!a) return ctx.answerCallbackQuery("❌ Не найдено");

  ctx.session.step = "test:agent";
  ctx.session.data = { agentId };

  const kb = new InlineKeyboard().text("✕ Отмена", `agent:info:${agentId}`);
  await ctx.editMessageText(
    `🧪 <b>Тест агента ${a.name}</b>\n\n` +
    `Отправь текст поста — агент ответит прямо в этот чат.\n` +
    `<i>Реальные сообщения в канал не отправляются.</i>`,
    { parse_mode: "HTML", reply_markup: kb }
  );
}

export async function handleTestStep(ctx: BotContext, postText: string): Promise<boolean> {
  if (ctx.session.step !== "test:agent") return false;

  const d = ctx.session.data as Record<string, unknown>;
  const agentId = d.agentId as number;
  const [a] = await db.select().from(agentsTable).where(eq(agentsTable.id, agentId));
  if (!a) return false;

  ctx.session.step = "idle";
  ctx.session.data = {};

  const loadingMsg = await ctx.reply("⏳ Агент думает…");

  const systemPrompt =
    a.userPrompt ??
    `Ты — ${a.name} (@${a.botUsername}), живой участник Telegram-канала. Пиши кратко и по-человечески.`;

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: `Новый пост в канале: "${postText}"` },
  ];

  const result = await callAI({ apiType: a.apiType, apiKey: a.apiKey, apiUrl: a.apiUrl, model: a.model, messages });

  try {
    await ctx.api.deleteMessage(ctx.chat!.id, loadingMsg.message_id);
  } catch {}

  if (result.error) {
    await ctx.reply(`❌ <b>Ошибка AI:</b>\n<code>${result.error}</code>`, { parse_mode: "HTML" });
    return true;
  }

  const { tags, clean } = parseTags(result.text);

  let tagsInfo = "";
  if (tags.silent) tagsInfo += "\n🔇 <i>Агент выбрал SILENT — в реальности ответа не было бы</i>";
  if (tags.sleep) tagsInfo += `\n⏱ <i>Агент бы подождал ${tags.sleep} сек перед ответом</i>`;
  if (tags.endDiscussion) tagsInfo += "\n🔚 <i>Агент завершил бы дискуссию</i>";

  const kb = new InlineKeyboard().text("🧪 Ещё тест", `agent:test:${agentId}`).text("‹ К агенту", `agent:info:${agentId}`);

  await ctx.reply(
    `🧪 <b>Ответ агента ${a.name}:</b>\n\n${clean}${tagsInfo}`,
    { parse_mode: "HTML", reply_markup: kb }
  );

  return true;
}
