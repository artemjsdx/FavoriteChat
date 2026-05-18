import { db } from "@workspace/db";
import {
  agentsTable,
  channelsTable,
  channelAgentsTable,
  messagesTable,
  discussionsTable,
} from "@workspace/db";
import { eq, and, desc, gte } from "drizzle-orm";
import { Bot } from "grammy";
import { callAI, type ChatMessage } from "./ai-clients";
import { parseTags } from "./tags";
import { logger } from "./logger";

interface TelegramMessage {
  message_id: number;
  chat: { id: number | string };
  from?: { id: number; first_name?: string; username?: string };
  text?: string;
  reply_to_message?: { message_id: number };
  sender_chat?: { id: number; title?: string };
}

// Random delay between min and max seconds
function randomDelay(minSec: number, maxSec: number): Promise<void> {
  const ms = (minSec + Math.random() * (maxSec - minSec)) * 1000;
  return new Promise((r) => setTimeout(r, ms));
}

// Check if agent should respond based on responseChance
function shouldRespond(chance: number): boolean {
  return Math.random() * 100 < chance;
}

// Build message history as chat messages for AI
async function buildContext(
  channelId: number,
  discussionId: number,
  contextCount: number
): Promise<ChatMessage[]> {
  const msgs = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.discussionId, discussionId))
    .orderBy(desc(messagesTable.createdAt))
    .limit(contextCount);

  return msgs
    .reverse()
    .map((m) => ({
      role: (m.isAgent ? "assistant" : "user") as "assistant" | "user",
      content: `${m.fromName ?? m.fromUsername ?? "User"}: ${m.text}`,
    }));
}

// Post a message in the comments group
async function postAgentMessage(
  bot: Bot,
  groupId: string,
  text: string,
  replyToId?: number | null
): Promise<number | null> {
  try {
    const params: Record<string, unknown> = {
      chat_id: groupId,
      text,
      parse_mode: "HTML",
    };
    if (replyToId) params.reply_to_message_id = replyToId;

    const sendOpts: Record<string, unknown> = { parse_mode: "HTML" };
    if (replyToId) sendOpts["reply_parameters"] = { message_id: replyToId };
    const msg = await (bot.api.sendMessage as Function)(groupId, text, sendOpts);

    return msg.message_id;
  } catch (err) {
    logger.error({ err, groupId }, "postAgentMessage failed");
    return null;
  }
}

export async function handleNewPost(opts: {
  channelChatId: string;
  triggerMessage: TelegramMessage;
}) {
  const { channelChatId, triggerMessage } = opts;

  const [channel] = await db
    .select()
    .from(channelsTable)
    .where(and(eq(channelsTable.telegramChatId, channelChatId), eq(channelsTable.active, true)));

  if (!channel) return;
  if (!channel.linkedGroupId) {
    logger.warn({ channelChatId }, "No linkedGroupId set, skipping orchestration");
    return;
  }

  // Get agents bound to this channel
  const bindings = await db
    .select({ agent: agentsTable })
    .from(channelAgentsTable)
    .innerJoin(agentsTable, eq(channelAgentsTable.agentId, agentsTable.id))
    .where(
      and(
        eq(channelAgentsTable.channelId, channel.id),
        eq(channelAgentsTable.active, true),
        eq(agentsTable.active, true)
      )
    );

  if (bindings.length === 0) return;

  // Create or find discussion
  const [discussion] = await db
    .insert(discussionsTable)
    .values({
      channelId: channel.id,
      triggerMessageId: triggerMessage.message_id,
      status: "active",
    })
    .returning();

  // Save the trigger post as a message
  await db.insert(messagesTable).values({
    channelId: channel.id,
    discussionId: discussion.id,
    telegramMessageId: triggerMessage.message_id,
    agentId: null,
    fromUsername: triggerMessage.sender_chat?.title ?? null,
    fromName: triggerMessage.sender_chat?.title ?? "Channel",
    text: triggerMessage.text ?? "",
    isAgent: false,
  });

  logger.info({ discussionId: discussion.id, channelChatId, agents: bindings.length }, "Discussion started");

  // Each agent decides whether to respond
  for (const { agent } of bindings) {
    if (!shouldRespond(agent.responseChance)) {
      logger.debug({ agentId: agent.id }, "Agent skipped (chance)");
      continue;
    }

    // Random delay
    await randomDelay(agent.minDelaySec, agent.maxDelaySec);

    try {
      const bot = new Bot(agent.botToken);
      const context = await buildContext(channel.id, discussion.id, channel.contextMessages);

      const systemPrompt =
        agent.userPrompt ??
        `Ты — ${agent.name} (@${agent.botUsername}), живой участник Telegram-канала. 
Ты можешь использовать теги для управления поведением:
[SLEEP:N] — подождать N секунд перед следующим ответом
[SILENT] — не отвечать на этот пост
[END_DISCUSSION] — завершить обсуждение
[REPLY:message_id] — ответить на конкретное сообщение
[REACT:emoji] — поставить реакцию
Пиши кратко и по-человечески, как обычный участник чата.`;

      const messages: ChatMessage[] = [
        { role: "system", content: systemPrompt },
        ...context,
        {
          role: "user",
          content: `Новый пост в канале: "${triggerMessage.text ?? ""}"`,
        },
      ];

      const aiResult = await callAI({
        apiType: agent.apiType,
        apiKey: agent.apiKey,
        apiUrl: agent.apiUrl,
        model: agent.model,
        messages,
      });

      if (aiResult.error || !aiResult.text.trim()) {
        logger.error({ agentId: agent.id, error: aiResult.error }, "AI call failed");
        continue;
      }

      const { tags, clean } = parseTags(aiResult.text);

      if (tags.silent) {
        logger.debug({ agentId: agent.id }, "Agent chose SILENT");
        continue;
      }

      if (tags.sleep && tags.sleep > 0) {
        await new Promise((r) => setTimeout(r, tags.sleep! * 1000));
      }

      const sentId = await postAgentMessage(
        bot,
        channel.linkedGroupId!,
        clean,
        tags.replyTo ?? undefined
      );

      if (sentId) {
        await db.insert(messagesTable).values({
          channelId: channel.id,
          discussionId: discussion.id,
          telegramMessageId: sentId,
          agentId: agent.id,
          fromUsername: agent.botUsername,
          fromName: agent.name,
          text: clean,
          replyToMessageId: tags.replyTo ?? null,
          isAgent: true,
        });

        if (tags.react) {
          try {
            await (bot.api.setMessageReaction as Function)(
              channel.linkedGroupId!, sentId,
              { reaction: [{ type: "emoji", emoji: tags.react }] }
            );
          } catch {}
        }
      }

      if (tags.endDiscussion) {
        await db
          .update(discussionsTable)
          .set({ status: "ended", endedAt: new Date() })
          .where(eq(discussionsTable.id, discussion.id));
        logger.info({ discussionId: discussion.id }, "Discussion ended by agent tag");
        break;
      }
    } catch (err) {
      logger.error({ err, agentId: agent.id }, "Agent execution error");
    }
  }
}
