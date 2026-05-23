import express from "express";
import { type Bot } from "grammy";
import type { BotContext } from "./bot/index.js";
import { handleNewPost } from "./core/orchestrator.js";
import { logger } from "./logger.js";

export function createServer(bot: Bot<BotContext>) {
  const app = express();
  app.use(express.json({ limit: "5mb" }));

  // Health check
  app.get("/health", (_req, res) => {
    res.json({ ok: true, ts: new Date().toISOString() });
  });

  // Main bot webhook
  app.post("/webhook/main", async (req, res) => {
    res.json({ ok: true });
    try {
      await bot.handleUpdate(req.body);
    } catch (err) {
      logger.error({ err }, "Main bot webhook error");
    }
  });

  // Channel webhook for orchestration (when using webhooks for channel posts)
  app.post("/webhook/channel", async (req, res) => {
    res.json({ ok: true });
    try {
      const update = req.body;
      const msg = update.channel_post ?? update.message;
      if (!msg?.text) return;

      const chatId = String(msg.chat.id);
      const defaultReplyTo = update.message?.message_id ?? null;

      void handleNewPost({
        channelChatId: chatId,
        triggerMessage: msg,
        defaultReplyTo,
      });
    } catch (err) {
      logger.error({ err }, "Channel webhook error");
    }
  });

  return app;
}
