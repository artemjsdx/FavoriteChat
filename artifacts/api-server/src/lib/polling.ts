import { Bot } from "grammy";
import { db } from "@workspace/db";
import { agentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { handleNewPost } from "./orchestrator";
import { logger } from "./logger";

type AgentRow = typeof agentsTable.$inferSelect;

class PollingManager {
  private bots = new Map<number, Bot>();
  private enabled = false;

  /** Call once at startup. Returns true if polling mode is active. */
  async init(): Promise<boolean> {
    const publicUrl = process.env["PUBLIC_URL"] ?? "";
    const explicit = process.env["POLLING_MODE"];

    if (explicit === "false") {
      logger.info("Polling disabled (POLLING_MODE=false)");
      return false;
    }
    if (explicit === "true" || !publicUrl) {
      this.enabled = true;
      logger.info("Polling mode enabled — starting bots");
      await this.startAll();
      return true;
    }

    logger.info({ publicUrl }, "Webhook mode — polling disabled");
    return false;
  }

  isEnabled() {
    return this.enabled;
  }

  private attachHandler(bot: Bot, agent: AgentRow) {
    bot.on("channel_post", async (ctx) => {
      const post = ctx.channelPost;
      if (!post.text) return;
      try {
        await handleNewPost({
          channelChatId: String(post.chat.id),
          triggerMessage: {
            message_id: post.message_id,
            chat: { id: post.chat.id },
            text: post.text,
            sender_chat: post.sender_chat
              ? { id: post.sender_chat.id, title: post.sender_chat.title ?? undefined }
              : undefined,
          },
        });
      } catch (err) {
        logger.error({ err, agentId: agent.id }, "handleNewPost error in polling");
      }
    });
  }

  async startAll() {
    const agents = await db
      .select()
      .from(agentsTable)
      .where(eq(agentsTable.active, true));

    for (const agent of agents) {
      await this.startAgent(agent);
    }
    logger.info({ count: agents.length }, "Polling started for active agents");
  }

  async startAgent(agent: AgentRow) {
    if (!this.enabled) return;
    if (this.bots.has(agent.id)) {
      await this.stopAgent(agent.id);
    }

    try {
      const bot = new Bot(agent.botToken);
      this.attachHandler(bot, agent);

      // Start in background — do NOT await
      void bot
        .start({ allowed_updates: ["channel_post", "message"] })
        .catch((err) => {
          logger.error({ err, agentId: agent.id }, "Bot polling crashed");
          this.bots.delete(agent.id);
        });

      this.bots.set(agent.id, bot);
      logger.info({ agentId: agent.id, name: agent.name }, "Bot polling started");
    } catch (err) {
      logger.error({ err, agentId: agent.id }, "Failed to start bot polling");
    }
  }

  async stopAgent(agentId: number) {
    const bot = this.bots.get(agentId);
    if (!bot) return;
    try {
      await bot.stop();
    } catch {}
    this.bots.delete(agentId);
    logger.info({ agentId }, "Bot polling stopped");
  }

  async stopAll() {
    const ids = [...this.bots.keys()];
    await Promise.all(ids.map((id) => this.stopAgent(id)));
    logger.info("All bot polling stopped");
  }

  status() {
    return {
      enabled: this.enabled,
      runningBots: this.bots.size,
      agentIds: [...this.bots.keys()],
    };
  }
}

export const pollingManager = new PollingManager();
