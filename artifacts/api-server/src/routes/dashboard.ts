import { Router } from "express";
import { db } from "@workspace/db";
import {
  agentsTable,
  channelsTable,
  messagesTable,
  discussionsTable,
  settingsTable,
} from "@workspace/db";
import { eq, gte, and, desc, count } from "drizzle-orm";

const router = Router();

router.get("/dashboard/stats", async (req, res) => {
  try {
    const [totalAgentsRes] = await db.select({ count: count() }).from(agentsTable);
    const [totalChannelsRes] = await db.select({ count: count() }).from(channelsTable);
    const [activeAgentsRes] = await db.select({ count: count() }).from(agentsTable).where(eq(agentsTable.active, true));

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const [messagesTodayRes] = await db
      .select({ count: count() })
      .from(messagesTable)
      .where(and(eq(messagesTable.isAgent, true), gte(messagesTable.createdAt, todayStart)));

    const [activeDiscussionsRes] = await db
      .select({ count: count() })
      .from(discussionsTable)
      .where(eq(discussionsTable.status, "active"));

    res.json({
      totalAgents: totalAgentsRes.count,
      totalChannels: totalChannelsRes.count,
      messagesToday: messagesTodayRes.count,
      activeDiscussions: activeDiscussionsRes.count,
      activeAgents: activeAgentsRes.count,
    });
  } catch (err) {
    req.log.error({ err }, "getDashboardStats error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/activity", async (req, res) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? "50")), 100);
    const agentId = req.query.agentId ? parseInt(String(req.query.agentId)) : null;
    const channelId = req.query.channelId ? parseInt(String(req.query.channelId)) : null;

    const messages = await db
      .select({
        id: messagesTable.id,
        agentName: agentsTable.name,
        agentUsername: agentsTable.botUsername,
        channelTitle: channelsTable.title,
        channelId: messagesTable.channelId,
        text: messagesTable.text,
        replyToMessageId: messagesTable.replyToMessageId,
        createdAt: messagesTable.createdAt,
      })
      .from(messagesTable)
      .innerJoin(agentsTable, eq(messagesTable.agentId, agentsTable.id))
      .innerJoin(channelsTable, eq(messagesTable.channelId, channelsTable.id))
      .where(
        and(
          eq(messagesTable.isAgent, true),
          agentId ? eq(messagesTable.agentId, agentId) : undefined,
          channelId ? eq(messagesTable.channelId, channelId) : undefined
        )
      )
      .orderBy(desc(messagesTable.createdAt))
      .limit(limit);

    res.json(
      messages.map((m) => ({
        id: m.id,
        agentName: m.agentName,
        agentUsername: m.agentUsername,
        channelTitle: m.channelTitle,
        channelId: m.channelId,
        text: m.text,
        isReply: m.replyToMessageId != null,
        createdAt: m.createdAt.toISOString(),
      }))
    );
  } catch (err) {
    req.log.error({ err }, "getActivity error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/models", async (req, res) => {
  try {
    const r = await fetch("https://openrouter.ai/api/v1/models");
    const data = (await r.json()) as { data: Array<{ id: string; name: string; context_length: number; pricing?: { prompt: string } }> };

    const free = data.data
      .filter((m) => m.id.includes(":free") || parseFloat(m.pricing?.prompt ?? "1") === 0)
      .map((m) => ({ id: m.id, name: m.name, free: true, contextLength: m.context_length, pricing: "Free" }));

    const paid = data.data
      .filter((m) => !m.id.includes(":free") && parseFloat(m.pricing?.prompt ?? "0") > 0)
      .slice(0, 50)
      .map((m) => ({
        id: m.id, name: m.name, free: false, contextLength: m.context_length,
        pricing: `$${(parseFloat(m.pricing?.prompt ?? "0") * 1000000).toFixed(2)}/M tokens`,
      }));

    const favoriteModels = [
      { id: "gemini-3.0-flash-thinking", name: "Gemini 3.0 Flash Thinking (200k, DEFAULT)", free: true, contextLength: 200000, pricing: "FavoriteAPI" },
      { id: "gemini-3.0-flash", name: "Gemini 3.0 Flash (200k, faster)", free: true, contextLength: 200000, pricing: "FavoriteAPI" },
      { id: "gemini-2.5-flash-thinking", name: "Gemini 2.5 Flash Thinking (200k)", free: true, contextLength: 200000, pricing: "FavoriteAPI" },
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash (200k)", free: true, contextLength: 200000, pricing: "FavoriteAPI" },
      { id: "gemini-2.5-mini-thinking", name: "Gemini 2.5 Mini Thinking (200k)", free: true, contextLength: 200000, pricing: "FavoriteAPI" },
      { id: "gemini-2.5-mini", name: "Gemini 2.5 Mini (200k)", free: true, contextLength: 200000, pricing: "FavoriteAPI" },
      { id: "gemini-1.5-robotics-er-preview", name: "Gemini 1.5 Robotics (200k)", free: true, contextLength: 200000, pricing: "FavoriteAPI" },
      { id: "gemini-3.0-flash-thinking-64k", name: "Gemini 3.0 Flash Thinking 64k (fast cold start)", free: true, contextLength: 64000, pricing: "FavoriteAPI" },
      { id: "gemini-3.0-flash-64k", name: "Gemini 3.0 Flash 64k", free: true, contextLength: 64000, pricing: "FavoriteAPI" },
      { id: "gemini-2.5-flash-thinking-64k", name: "Gemini 2.5 Flash Thinking 64k", free: true, contextLength: 64000, pricing: "FavoriteAPI" },
      { id: "gemini-2.5-flash-64k", name: "Gemini 2.5 Flash 64k", free: true, contextLength: 64000, pricing: "FavoriteAPI" },
    ];

    res.json({ free, paid, favoriteModels });
  } catch (err) {
    req.log.error({ err }, "getModels error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/settings", async (req, res) => {
  try {
    let [settings] = await db.select().from(settingsTable).limit(1);
    if (!settings) {
      [settings] = await db.insert(settingsTable).values({}).returning();
    }
    res.json({
      id: settings.id,
      favoriteApiUrl: settings.favoriteApiUrl,
      defaultContextMessages: settings.defaultContextMessages,
      updatedAt: settings.updatedAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "getSettings error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/settings", async (req, res) => {
  try {
    let [existing] = await db.select().from(settingsTable).limit(1);
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (req.body.favoriteApiUrl != null) updates.favoriteApiUrl = req.body.favoriteApiUrl;
    if (req.body.defaultContextMessages != null) updates.defaultContextMessages = req.body.defaultContextMessages;

    let settings;
    if (existing) {
      [settings] = await db.update(settingsTable).set(updates).where(eq(settingsTable.id, existing.id)).returning();
    } else {
      [settings] = await db.insert(settingsTable).values(updates).returning();
    }
    res.json({
      id: settings.id, favoriteApiUrl: settings.favoriteApiUrl,
      defaultContextMessages: settings.defaultContextMessages,
      updatedAt: settings.updatedAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "updateSettings error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
