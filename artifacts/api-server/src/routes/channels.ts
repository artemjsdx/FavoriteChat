import { Router } from "express";
import { db } from "@workspace/db";
import { channelsTable, channelAgentsTable, agentsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { CreateChannelBody, UpdateChannelBody, BindChannelAgentBody } from "@workspace/api-zod";

const router = Router();

router.get("/channels", async (req, res): Promise<void> => {
  try {
    const channels = await db.select().from(channelsTable).orderBy(channelsTable.createdAt);
    const withCounts = await Promise.all(channels.map(async (ch) => {
      const bindings = await db.select().from(channelAgentsTable)
        .where(and(eq(channelAgentsTable.channelId, ch.id), eq(channelAgentsTable.active, true)));
      return channelToJson(ch, bindings.length);
    }));
    res.json(withCounts);
  } catch (err) {
    req.log.error({ err }, "listChannels error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/channels", async (req, res): Promise<void> => {
  const parse = CreateChannelBody.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: "Invalid body", details: parse.error.issues }); return; }
  try {
    const [ch] = await db.insert(channelsTable).values({
      userId: parse.data.userId ?? null,
      telegramChatId: parse.data.telegramChatId,
      linkedGroupId: parse.data.linkedGroupId ?? null,
      title: parse.data.title,
      type: parse.data.type,
      contextMessages: parse.data.contextMessages ?? 10,
    }).returning();
    res.status(201).json(channelToJson(ch, 0));
  } catch (err) {
    req.log.error({ err }, "createChannel error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/channels/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [ch] = await db.select().from(channelsTable).where(eq(channelsTable.id, id));
  if (!ch) { res.status(404).json({ error: "Not found" }); return; }
  const bindings = await db.select().from(channelAgentsTable)
    .where(and(eq(channelAgentsTable.channelId, id), eq(channelAgentsTable.active, true)));
  res.json(channelToJson(ch, bindings.length));
});

router.put("/channels/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parse = UpdateChannelBody.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: "Invalid body" }); return; }
  const updates: Record<string, unknown> = {};
  const b = parse.data;
  if (b.title != null) updates.title = b.title;
  if (b.linkedGroupId != null) updates.linkedGroupId = b.linkedGroupId;
  if (b.contextMessages != null) updates.contextMessages = b.contextMessages;
  if (b.active != null) updates.active = b.active;
  const [ch] = await db.update(channelsTable).set(updates).where(eq(channelsTable.id, id)).returning();
  if (!ch) { res.status(404).json({ error: "Not found" }); return; }
  res.json(channelToJson(ch, null));
});

router.delete("/channels/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(channelAgentsTable).where(eq(channelAgentsTable.channelId, id));
  await db.delete(channelsTable).where(eq(channelsTable.id, id));
  res.json({ success: true, message: null });
});

router.get("/channels/:id/agents", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const bindings = await db.select({ agent: agentsTable })
    .from(channelAgentsTable)
    .innerJoin(agentsTable, eq(channelAgentsTable.agentId, agentsTable.id))
    .where(and(eq(channelAgentsTable.channelId, id), eq(channelAgentsTable.active, true)));
  res.json(bindings.map(({ agent: a }) => ({
    id: a.id, userId: a.userId, name: a.name, botUsername: a.botUsername, botId: a.botId,
    apiType: a.apiType, model: a.model, apiUrl: a.apiUrl, userPrompt: a.userPrompt,
    responseChance: a.responseChance, minDelaySec: a.minDelaySec, maxDelaySec: a.maxDelaySec,
    active: a.active, webhookRegistered: a.webhookRegistered, createdAt: a.createdAt.toISOString(),
  })));
});

router.post("/channels/:id/agents", async (req, res): Promise<void> => {
  const channelId = parseInt(req.params.id as string);
  if (isNaN(channelId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parse = BindChannelAgentBody.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: "Invalid body" }); return; }
  try {
    await db.insert(channelAgentsTable).values({
      channelId, agentId: parse.data.agentId, priority: parse.data.priority ?? 0,
    }).onConflictDoNothing();
    res.status(201).json({ success: true, message: null });
  } catch (err) {
    req.log.error({ err }, "bindChannelAgent error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/channels/:id/agents/:agentId", async (req, res): Promise<void> => {
  const channelId = parseInt(req.params.id as string);
  const agentId = parseInt(req.params.agentId as string);
  if (isNaN(channelId) || isNaN(agentId)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(channelAgentsTable)
    .where(and(eq(channelAgentsTable.channelId, channelId), eq(channelAgentsTable.agentId, agentId)));
  res.json({ success: true, message: null });
});

function channelToJson(ch: typeof channelsTable.$inferSelect, agentCount: number | null) {
  return {
    id: ch.id, userId: ch.userId, telegramChatId: ch.telegramChatId, linkedGroupId: ch.linkedGroupId,
    title: ch.title, type: ch.type, contextMessages: ch.contextMessages, active: ch.active,
    agentCount, createdAt: ch.createdAt.toISOString(),
  };
}

export default router;
