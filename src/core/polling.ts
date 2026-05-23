import { Bot } from "grammy";
import { logger } from "../logger.js";

interface AgentRecord {
  id: number;
  botToken: string;
  active: boolean;
}

class PollingManager {
  private bots = new Map<number, Bot>();
  private _enabled = false;

  isEnabled() { return this._enabled; }

  enable() { this._enabled = true; }

  async startAgent(agent: AgentRecord, onUpdate: (bot: Bot, update: unknown) => void) {
    if (this.bots.has(agent.id)) return;
    try {
      const bot = new Bot(agent.botToken);
      bot.catch((err) => logger.error({ err, agentId: agent.id }, "Agent bot error"));
      this.bots.set(agent.id, bot);
      void bot.start({
        drop_pending_updates: true,
        onStart: () => logger.info({ agentId: agent.id }, "Agent polling started"),
      });
      logger.info({ agentId: agent.id, username: "@?" }, "Agent bot started in polling");
    } catch (err) {
      logger.error({ err, agentId: agent.id }, "Failed to start agent polling");
    }
  }

  async stopAgent(agentId: number) {
    const bot = this.bots.get(agentId);
    if (!bot) return;
    try {
      await bot.stop();
      this.bots.delete(agentId);
      logger.info({ agentId }, "Agent polling stopped");
    } catch (err) {
      logger.error({ err, agentId }, "Error stopping agent polling");
    }
  }

  async stopAll() {
    for (const [id] of this.bots) await this.stopAgent(id);
  }
}

export const pollingManager = new PollingManager();
