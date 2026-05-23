import { Bot } from "grammy";
import { logger } from "../logger.js";

let _mainBot: Bot | null = null;
let _ownerId: number | null = null;

export function initNotifications(bot: Bot) {
  _mainBot = bot;
  const id = parseInt(process.env.OWNER_TELEGRAM_ID ?? "0");
  _ownerId = id > 0 ? id : null;
}

export async function notifyOwner(html: string): Promise<void> {
  if (!_mainBot || !_ownerId) return;
  try {
    await _mainBot.api.sendMessage(_ownerId, html, { parse_mode: "HTML" });
  } catch (err) {
    logger.warn({ err }, "Failed to notify owner");
  }
}
