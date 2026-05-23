import { Bot } from "grammy";
import { db, agentsTable, channelsTable, channelAgentsTable, messagesTable, discussionsTable } from "../db/index.js";
import { eq, and, desc, inArray } from "drizzle-orm";
import { callAI, type ChatMessage } from "./ai-clients.js";
import { parseTags } from "./tags.js";
import { logger } from "../logger.js";
import { notifyOwner } from "../bot/notifications.js";

export function chatIdVariants(id: string | number | null | undefined): string[] {
  if (id === null || id === undefined) return [];
  const s = String(id).trim();
  if (!s) return [];
  const set = new Set<string>([s]);
  if (s.startsWith("-100")) {
    set.add(s.slice(4)); set.add("-" + s.slice(4));
  } else if (s.startsWith("-")) {
    set.add(s.slice(1)); set.add("-100" + s.slice(1));
  } else if (/^\d+$/.test(s)) {
    set.add("-" + s); set.add("-100" + s);
  }
  return [...set];
}

interface TelegramMessage {
  message_id: number;
  chat: { id: number | string };
  from?: { id: number; first_name?: string; username?: string };
  text?: string;
  reply_to_message?: { message_id: number };
  sender_chat?: { id: number; title?: string };
}

function randomDelay(minSec: number, maxSec: number): Promise<void> {
  const ms = (minSec + Math.random() * (maxSec - minSec)) * 1000;
  return new Promise((r) => setTimeout(r, ms));
}

async function buildContext(discussionId: number, contextCount: number): Promise<ChatMessage[]> {
  const msgs = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.discussionId, discussionId))
    .orderBy(desc(messagesTable.createdAt))
    .limit(contextCount);

  return msgs.reverse().map((m) => ({
    role: (m.isAgent ? "assistant" : "user") as "assistant" | "user",
    content: `${m.fromName ?? m.fromUsername ?? "User"}: ${m.text}`,
  }));
}

async function postAgentMessage(
  bot: Bot,
  groupId: string,
  text: string,
  replyToId?: number | null
): Promise<{ messageId: number; resolvedGroupId: string } | null> {
  const sendOpts: Record<string, unknown> = { parse_mode: "HTML" };
  if (replyToId) sendOpts.reply_parameters = { message_id: replyToId };

  for (const variant of chatIdVariants(groupId)) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const msg = await (bot.api.sendMessage as any)(variant, text, sendOpts);
      return { messageId: msg.message_id, resolvedGroupId: variant };
    } catch (err) {
      if (/chat not found|chat_id is empty/i.test(String(err))) continue;
      logger.error({ err, groupId, variant }, "postAgentMessage failed");
      return null;
    }
  }
  return null;
}

export async function handleNewPost(opts: {
  channelChatId: string;
  triggerMessage: TelegramMessage;
  defaultReplyTo?: number | null;
}) {
  const { channelChatId, triggerMessage } = opts;
  const defaultReplyTo = opts.defaultReplyTo ?? null;

  const [channel] = await db
    .select()
    .from(channelsTable)
    .where(and(inArray(channelsTable.telegramChatId, chatIdVariants(channelChatId)), eq(channelsTable.active, true)));

  if (!channel) return;
  if (!channel.linkedGroupId) {
    logger.warn({ channelChatId }, "No linkedGroupId — skipping");
    return;
  }

  const bindings = await db
    .select({ agent: agentsTable })
    .from(channelAgentsTable)
    .innerJoin(agentsTable, eq(channelAgentsTable.agentId, agentsTable.id))
    .where(and(eq(channelAgentsTable.channelId, channel.id), eq(channelAgentsTable.active, true), eq(agentsTable.active, true)));

  if (bindings.length === 0) return;

  const [discussion] = await db
    .insert(discussionsTable)
    .values({ channelId: channel.id, triggerMessageId: triggerMessage.message_id, status: "active" })
    .returning();

  await db.insert(messagesTable).values({
    channelId: channel.id,
    discussionId: discussion!.id,
    telegramMessageId: triggerMessage.message_id,
    agentId: null,
    fromUsername: triggerMessage.sender_chat?.title ?? null,
    fromName: triggerMessage.sender_chat?.title ?? "Channel",
    text: triggerMessage.text ?? "",
    isAgent: false,
  });

  logger.info({ discussionId: discussion!.id, channelChatId, agents: bindings.length }, "Discussion started");

  for (const { agent } of bindings) {
    if (Math.random() * 100 >= agent.responseChance) {
      logger.debug({ agentId: agent.id }, "Agent skipped (chance)");
      continue;
    }

    await randomDelay(agent.minDelaySec, agent.maxDelaySec);

    try {
      const bot = new Bot(agent.botToken);
      const context = await buildContext(discussion!.id, channel.contextMessages);

      const systemPrompt =
        agent.userPrompt ??
        `Ты — ${agent.name} (@${agent.botUsername}), живой участник Telegram-канала.
Управляющие теги (ставь в конец ответа):
[SLEEP:N] — пауза N секунд перед ответом
[SILENT] — не отвечать на этот пост
[END_DISCUSSION] — завершить дискуссию
[REPLY:message_id] — ответить на конкретное сообщение
[REACT:emoji] — поставить реакцию
Пиши кратко и по-человечески.`;

      const messages: ChatMessage[] = [
        { role: "system", content: systemPrompt },
        ...context,
        { role: "user", content: `Новый пост в канале: "${triggerMessage.text ?? ""}"` },
      ];

      const aiResult = await callAI({ apiType: agent.apiType, apiKey: agent.apiKey, apiUrl: agent.apiUrl, model: agent.model, messages });

      if (aiResult.error || !aiResult.text.trim()) {
        logger.error({ agentId: agent.id, error: aiResult.error }, "AI call failed");
        await notifyOwner(`⚠️ Агент <b>${agent.name}</b> — ошибка AI:\n<code>${aiResult.error ?? "пустой ответ"}</code>`);
        continue;
      }

      const { tags, clean } = parseTags(aiResult.text);
      if (tags.silent) { logger.debug({ agentId: agent.id }, "Agent SILENT"); continue; }
      if (tags.sleep && tags.sleep > 0) await new Promise((r) => setTimeout(r, tags.sleep! * 1000));

      const replyTarget = tags.replyTo ?? defaultReplyTo ?? undefined;
      const sent = await postAgentMessage(bot, channel.linkedGroupId!, clean, replyTarget);

      if (sent) {
        await db.insert(messagesTable).values({
          channelId: channel.id,
          discussionId: discussion!.id,
          telegramMessageId: sent.messageId,
          agentId: agent.id,
          fromUsername: agent.botUsername,
          fromName: agent.name,
          text: clean,
          replyToMessageId: replyTarget ?? null,
          isAgent: true,
        });

        if (tags.react && defaultReplyTo) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (bot.api.setMessageReaction as any)(sent.resolvedGroupId, defaultReplyTo, {
              reaction: [{ type: "emoji", emoji: tags.react }],
            });
          } catch {}
        }
      }

      if (tags.endDiscussion) {
        await db.update(discussionsTable).set({ status: "ended", endedAt: new Date() }).where(eq(discussionsTable.id, discussion!.id));
        logger.info({ discussionId: discussion!.id }, "Discussion ended by agent");
        break;
      }
    } catch (err) {
      logger.error({ err, agentId: agent.id }, "Agent execution error");
    }
  }
}
