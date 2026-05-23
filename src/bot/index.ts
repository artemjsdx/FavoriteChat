import { Bot, session } from "grammy";
import type { Context, SessionFlavor } from "grammy";
import { sessionStorage, defaultSession, type SessionData } from "./session.js";
import { showMainMenu } from "./menus/main.js";
import { showAgentsList, showAgentInfo, toggleAgent, confirmDeleteAgent, doDeleteAgent } from "./menus/agents.js";
import { showChannelsList, showChannelInfo, toggleChannel, showBindList, doBind, showUnbindList, doUnbind, confirmDeleteChannel, doDeleteChannel } from "./menus/channels.js";
import { showSettings, saveSettings, toggleDebug } from "./menus/settings.js";
import { showStatus } from "./menus/status.js";
import { showHelp } from "./menus/help.js";
import {
  startAddAgent, handleAddAgentStep,
  handleApiTypeCallback, handleModelCallback, handlePromptDefault,
  handleChanceCallback, handleDelayCallback, confirmCreateAgent,
} from "./wizards/add-agent.js";
import {
  startAddChannel, handleAddChannelStep,
  skipGroupId, confirmCreateChannel,
} from "./wizards/add-channel.js";
import {
  showEditMenu, startEditField, handleEditStep, applyEditCallback,
} from "./wizards/edit-agent.js";
import { startTestAgent, handleTestStep } from "./wizards/test-agent.js";
import { logger } from "../logger.js";

export type BotContext = Context & SessionFlavor<SessionData>;

export function createBot(token: string): Bot<BotContext> {
  const bot = new Bot<BotContext>(token);

  // Session middleware — stored in PostgreSQL
  bot.use(session({
    initial: defaultSession,
    storage: sessionStorage,
    getSessionKey: (ctx) => ctx.chat?.id.toString(),
  }));

  // Owner-only filter
  const ownerId = parseInt(process.env.OWNER_TELEGRAM_ID ?? "0");
  if (ownerId > 0) {
    bot.use(async (ctx, next) => {
      if (!ctx.from || ctx.from.id !== ownerId) {
        if (ctx.message || ctx.callbackQuery) {
          await ctx.reply("⛔ Доступ запрещён.").catch(() => {});
        }
        return;
      }
      return next();
    });
  }

  // ── Commands ───────────────────────────────────────────────────────────────
  bot.command("start", async (ctx) => {
    ctx.session.step = "idle";
    ctx.session.data = {};
    await showMainMenu(ctx);
  });

  bot.command("cancel", async (ctx) => {
    ctx.session.step = "idle";
    ctx.session.data = {};
    await ctx.reply("✕ Отменено.", { parse_mode: "HTML" });
    await showMainMenu(ctx);
  });

  bot.command("menu", async (ctx) => {
    ctx.session.step = "idle";
    ctx.session.data = {};
    await showMainMenu(ctx);
  });

  bot.command("status", async (ctx) => showStatus(ctx));
  bot.command("agents", async (ctx) => showAgentsList(ctx));
  bot.command("channels", async (ctx) => showChannelsList(ctx));
  bot.command("settings", async (ctx) => showSettings(ctx));
  bot.command("help", async (ctx) => showHelp(ctx));

  // ── Callback queries ───────────────────────────────────────────────────────
  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    await ctx.answerCallbackQuery().catch(() => {});

    // Navigation
    if (data === "menu:main") return showMainMenu(ctx, true);
    if (data === "menu:agents") return showAgentsList(ctx);
    if (data === "menu:channels") return showChannelsList(ctx);
    if (data === "menu:settings") return showSettings(ctx);
    if (data === "menu:status") return showStatus(ctx);
    if (data === "menu:help") return showHelp(ctx);

    // Help topics
    if (data.startsWith("help:")) {
      const topic = data.split(":")[1];
      return showHelp(ctx, topic);
    }

    // Agent actions
    if (data.startsWith("agent:info:")) return showAgentInfo(ctx, parseInt(data.split(":")[2]!));
    if (data.startsWith("agent:toggle:")) return toggleAgent(ctx, parseInt(data.split(":")[2]!));
    if (data.startsWith("agent:delete:")) return confirmDeleteAgent(ctx, parseInt(data.split(":")[2]!));
    if (data.startsWith("agent:delete_confirm:")) return doDeleteAgent(ctx, parseInt(data.split(":")[2]!));
    if (data.startsWith("agent:edit:")) return showEditMenu(ctx, parseInt(data.split(":")[2]!));
    if (data.startsWith("agent:test:")) return startTestAgent(ctx, parseInt(data.split(":")[2]!));

    // Edit agent fields
    if (data.startsWith("edit:prompt:")) return startEditField(ctx, parseInt(data.split(":")[2]!), "prompt");
    if (data.startsWith("edit:chance:")) return startEditField(ctx, parseInt(data.split(":")[2]!), "chance");
    if (data.startsWith("edit:delay:")) return startEditField(ctx, parseInt(data.split(":")[2]!), "delay");
    if (data.startsWith("edit:api_key:")) return startEditField(ctx, parseInt(data.split(":")[2]!), "api_key");
    if (data.startsWith("edit:model:")) return startEditField(ctx, parseInt(data.split(":")[2]!), "model");
    if (data.startsWith("edit:chance_val:")) {
      const [,, agentId, val] = data.split(":");
      return applyEditCallback(ctx, parseInt(agentId!), "chance_val", val!);
    }
    if (data.startsWith("edit:delay_val:")) {
      const parts = data.split(":");
      return applyEditCallback(ctx, parseInt(parts[2]!), "delay_val", parts[3]!, parts[4]!);
    }
    if (data.startsWith("edit:model_val:")) {
      const parts = data.split(":");
      return applyEditCallback(ctx, parseInt(parts[2]!), "model_val", parts.slice(3).join(":"));
    }
    if (data.startsWith("edit:prompt_default:")) {
      return applyEditCallback(ctx, parseInt(data.split(":")[2]!), "prompt_default");
    }

    // Channel actions
    if (data.startsWith("ch:info:")) return showChannelInfo(ctx, parseInt(data.split(":")[2]!));
    if (data.startsWith("ch:toggle:")) return toggleChannel(ctx, parseInt(data.split(":")[2]!));
    if (data.startsWith("ch:bind:")) return showBindList(ctx, parseInt(data.split(":")[2]!));
    if (data.startsWith("ch:unbind_list:")) return showUnbindList(ctx, parseInt(data.split(":")[2]!));
    if (data.startsWith("ch:do_bind:")) {
      const [,, channelId, agentId] = data.split(":");
      return doBind(ctx, parseInt(channelId!), parseInt(agentId!));
    }
    if (data.startsWith("ch:do_unbind:")) {
      const [,, channelId, agentId] = data.split(":");
      return doUnbind(ctx, parseInt(channelId!), parseInt(agentId!));
    }
    if (data.startsWith("ch:delete:")) return confirmDeleteChannel(ctx, parseInt(data.split(":")[2]!));
    if (data.startsWith("ch:delete_confirm:")) return doDeleteChannel(ctx, parseInt(data.split(":")[2]!));

    // Settings
    if (data === "set:toggle:debug") return toggleDebug(ctx);
    if (data === "set:edit:fav_url") {
      ctx.session.step = "set:fav_url";
      ctx.session.data = {};
      await ctx.editMessageText(
        `✏️ <b>FavoriteAPI URL</b>\n\n` +
        `Введи базовый URL своего FavoriteAPI-сервера.\n` +
        `Пример: <code>https://xxxx.trycloudflare.com</code>\n\n` +
        `Или отправь <code>-</code> чтобы сбросить.`,
        { parse_mode: "HTML" }
      ).catch(() => {});
      return;
    }
    if (data === "set:edit:ctx_msgs") {
      ctx.session.step = "set:ctx_msgs";
      ctx.session.data = {};
      await ctx.editMessageText(
        `✏️ <b>Размер контекста</b>\n\n` +
        `Сколько последних сообщений агент учитывает при ответе.\n` +
        `Введи число (1–50). Рекомендуется: <b>10</b>`,
        { parse_mode: "HTML" }
      ).catch(() => {});
      return;
    }

    // Wizards
    if (data === "wizard:add_agent") return startAddAgent(ctx);
    if (data === "wizard:add_channel") return startAddChannel(ctx);
    if (data === "wizard:cancel") {
      ctx.session.step = "idle";
      ctx.session.data = {};
      return showMainMenu(ctx, true);
    }

    // Add agent wizard callbacks
    if (data.startsWith("aa:apitype:")) return handleApiTypeCallback(ctx, data.split(":")[2]!);
    if (data.startsWith("aa:model:")) return handleModelCallback(ctx, data.slice("aa:model:".length));
    if (data === "aa:prompt:default") return handlePromptDefault(ctx);
    if (data.startsWith("aa:chance:")) return handleChanceCallback(ctx, data.split(":")[2]!);
    if (data.startsWith("aa:delay:")) {
      const parts = data.split(":");
      return handleDelayCallback(ctx, parseInt(parts[2]!), parseInt(parts[3]!));
    }
    if (data === "aa:confirm:yes") return confirmCreateAgent(ctx);

    // Add channel wizard callbacks
    if (data === "ac:skip_group") return skipGroupId(ctx);
    if (data === "ac:confirm:yes") return confirmCreateChannel(ctx);

    logger.warn({ data }, "Unknown callback query");
  });

  // ── Text messages (FSM) ────────────────────────────────────────────────────
  bot.on("message:text", async (ctx) => {
    const step = ctx.session.step;
    const text = ctx.message.text.trim();

    // Global cancel
    if (text === "/cancel" || text === "✕ Отмена") {
      ctx.session.step = "idle";
      ctx.session.data = {};
      return showMainMenu(ctx);
    }

    // Wizard steps
    if (step.startsWith("aa:")) {
      return handleAddAgentStep(ctx, text);
    }
    if (step.startsWith("ac:")) {
      return handleAddChannelStep(ctx, text);
    }
    if (step.startsWith("edit:")) {
      return handleEditStep(ctx, text);
    }
    if (step === "test:agent") {
      return handleTestStep(ctx, text);
    }

    // Settings text inputs
    if (step === "set:fav_url") {
      ctx.session.step = "idle";
      const url = text === "-" ? null : text.replace(/\/$/, "");
      await saveSettings({ favoriteApiUrl: url });
      await ctx.reply(url ? `✅ FavoriteAPI URL сохранён: <code>${url}</code>` : "✅ FavoriteAPI URL сброшен.", { parse_mode: "HTML" });
      return showSettings(ctx);
    }
    if (step === "set:ctx_msgs") {
      const n = parseInt(text);
      if (isNaN(n) || n < 1 || n > 50) {
        await ctx.reply("❌ Введи число от 1 до 50:");
        return;
      }
      ctx.session.step = "idle";
      await saveSettings({ defaultContextMessages: n });
      await ctx.reply(`✅ Контекст: ${n} сообщений.`);
      return showSettings(ctx);
    }

    // Default: show main menu
    return showMainMenu(ctx);
  });

  // Error handler
  bot.catch((err) => {
    logger.error({ err: err.error, ctx: err.ctx?.update }, "Bot error");
  });

  return bot;
}
