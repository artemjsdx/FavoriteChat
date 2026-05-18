import { Router } from "express";
import { db } from "@workspace/db";
import { agentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { handleNewPost } from "../lib/orchestrator";
import { logger } from "../lib/logger";

const router = Router();

// Telegram sends updates to /api/webhook/:botToken
router.post("/webhook/:botToken", async (req, res) => {
  // Always respond 200 immediately to Telegram
  res.sendStatus(200);

  const { botToken } = req.params;
  const update = req.body;

  try {
    const [agent] = await db.select().from(agentsTable).where(eq(agentsTable.botToken, botToken));
    if (!agent) return;

    // Channel post
    const post = update.channel_post;
    if (post && post.text) {
      await handleNewPost({
        channelChatId: String(post.chat.id),
        triggerMessage: post,
      });
    }

    // Message in group (comment)
    const msg = update.message;
    if (msg && msg.text && msg.chat?.type !== "channel") {
      logger.debug({ messageId: msg.message_id, chatId: msg.chat?.id }, "Group message received");
    }
  } catch (err) {
    logger.error({ err }, "webhook handler error");
  }
});

export default router;
