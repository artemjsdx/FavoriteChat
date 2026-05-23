import "dotenv/config";
import { createBot } from "./bot/index.js";
import { createServer } from "./server.js";
import { pollingManager } from "./core/polling.js";
import { initNotifications } from "./bot/notifications.js";
import { db, agentsTable, channelsTable } from "./db/index.js";
import { eq, and } from "drizzle-orm";
import { handleNewPost, chatIdVariants } from "./core/orchestrator.js";
import { logger } from "./logger.js";
import { Bot } from "grammy";

const PORT = parseInt(process.env.PORT ?? "5000");
const BOT_TOKEN = process.env.MAIN_BOT_TOKEN ?? "";
const PUBLIC_URL = (process.env.PUBLIC_URL ?? "").trim();

if (!BOT_TOKEN) {
  logger.error("MAIN_BOT_TOKEN not set. Edit .env and restart.");
  process.exit(1);
}

// ── Main bot ──────────────────────────────────────────────────────────────────
const bot = createBot(BOT_TOKEN);
initNotifications(bot);

// ── Express server ────────────────────────────────────────────────────────────
const app = createServer(bot);
const server = app.listen(PORT, () => {
  logger.info(`Server listening on port ${PORT}`);
});

// ── Polling or Webhook ────────────────────────────────────────────────────────
async function start() {
  const usePolling = !PUBLIC_URL;

  if (usePolling) {
    pollingManager.enable();

    // Start main bot polling
    void bot.start({
      drop_pending_updates: true,
      onStart: () => logger.info("Main bot polling started"),
    });

    // Start agent bots polling + listen for channel posts
    const agents = await db.select().from(agentsTable).where(eq(agentsTable.active, true));
    const channels = await db.select().from(channelsTable).where(eq(channelsTable.active, true));

    for (const agent of agents) {
      const agentBot = new Bot(agent.botToken);
      agentBot.on("channel_post", async (ctx) => {
        const msg = ctx.channelPost;
        if (!msg.text) return;
        void handleNewPost({
          channelChatId: String(msg.chat.id),
          triggerMessage: {
            message_id: msg.message_id,
            chat: { id: msg.chat.id },
            text: msg.text,
            sender_chat: { id: msg.chat.id, title: msg.chat.title ?? "" },
          },
          defaultReplyTo: msg.message_id,
        });
      });

      agentBot.catch((err) => logger.error({ err, agentId: agent.id }, "Agent bot error"));
      void agentBot.start({ drop_pending_updates: true });
      logger.info({ agentId: agent.id, username: agent.botUsername }, "Agent polling started");
    }

    logger.info(`Polling mode active. ${agents.length} agents, ${channels.length} channels.`);
  } else {
    // Webhook mode
    const webhookUrl = `${PUBLIC_URL}/webhook/main`;
    await bot.api.setWebhook(webhookUrl, { drop_pending_updates: true });
    logger.info({ webhookUrl }, "Main bot webhook set");
  }

  logger.info("FavoriteChat v3.0 started ✅");
}

start().catch((err) => {
  logger.error({ err }, "Fatal startup error");
  process.exit(1);
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────
async function shutdown(signal: string) {
  logger.info({ signal }, "Shutting down...");
  server.close();
  await pollingManager.stopAll();
  await bot.stop();
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));
