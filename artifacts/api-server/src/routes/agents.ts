import { Router } from "express";
import { db } from "@workspace/db";
import { agentsTable, channelAgentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  CreateAgentBody,
  UpdateAgentBody,
  ValidateBotTokenBody,
  ValidateApiKeyBody,
} from "@workspace/api-zod";

const router = Router();

router.get("/agents", async (req, res): Promise<void> => {
  try {
    const agents = await db.select().from(agentsTable).orderBy(agentsTable.createdAt);
    res.json(agents.map(agentToJson));
  } catch (err) {
    req.log.error({ err }, "listAgents error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/agents/validate-token", async (req, res): Promise<void> => {
  const parse = ValidateBotTokenBody.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: "Invalid body" }); return; }
  try {
    const tgRes = await fetch(`https://api.telegram.org/bot${parse.data.token}/getMe`);
    const data = (await tgRes.json()) as { ok: boolean; result?: { id: number; username?: string; first_name?: string } };
    if (!data.ok) { res.json({ valid: false, error: "Invalid token", botId: null, username: null, firstName: null }); return; }
    res.json({ valid: true, botId: data.result?.id ?? null, username: data.result?.username ?? null, firstName: data.result?.first_name ?? null, error: null });
  } catch (err) {
    req.log.error({ err }, "validateBotToken error");
    res.json({ valid: false, error: "Network error", botId: null, username: null, firstName: null });
  }
});

router.post("/agents/validate-api-key", async (req, res): Promise<void> => {
  const parse = ValidateApiKeyBody.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: "Invalid body" }); return; }
  const { apiType, apiKey, apiUrl } = parse.data;
  try {
    if (apiType === "openrouter") {
      const r = await fetch("https://openrouter.ai/api/v1/models", { headers: { Authorization: `Bearer ${apiKey}` } });
      if (!r.ok) { res.json({ valid: false, error: "Invalid key", defaultModel: null, contextKb: null }); return; }
      res.json({ valid: true, defaultModel: "google/gemma-3-27b-it:free", contextKb: null, error: null }); return;
    }
    if (apiType === "favorite") {
      const base = apiUrl ?? "";
      if (!base) { res.json({ valid: false, error: "API URL required", defaultModel: null, contextKb: null }); return; }
      const r = await fetch(`${base}/api/v1/me`, { headers: { Authorization: `Bearer ${apiKey}` } });
      if (!r.ok) { res.json({ valid: false, error: "Invalid key or URL", defaultModel: null, contextKb: null }); return; }
      const d = (await r.json()) as { key?: { default_model?: string; context_kb?: number } };
      res.json({ valid: true, defaultModel: d.key?.default_model ?? "gemini-3.0-flash-thinking", contextKb: d.key?.context_kb ?? null, error: null }); return;
    }
    if (apiType === "openai") {
      const r = await fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${apiKey}` } });
      if (!r.ok) { res.json({ valid: false, error: "Invalid key", defaultModel: null, contextKb: null }); return; }
      res.json({ valid: true, defaultModel: "gpt-4o-mini", contextKb: null, error: null }); return;
    }
    res.json({ valid: false, error: "Unknown API type", defaultModel: null, contextKb: null });
  } catch (err) {
    req.log.error({ err }, "validateApiKey error");
    res.json({ valid: false, error: "Network error", defaultModel: null, contextKb: null });
  }
});

router.get("/agents/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [agent] = await db.select().from(agentsTable).where(eq(agentsTable.id, id));
  if (!agent) { res.status(404).json({ error: "Not found" }); return; }
  res.json(agentToJson(agent));
});

router.post("/agents", async (req, res): Promise<void> => {
  const parse = CreateAgentBody.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: "Invalid body", details: parse.error.issues }); return; }
  const body = parse.data;
  try {
    const tgRes = await fetch(`https://api.telegram.org/bot${body.botToken}/getMe`);
    const tgData = (await tgRes.json()) as { ok: boolean; result?: { id: number; username?: string; first_name?: string } };
    if (!tgData.ok) { res.status(400).json({ error: "Invalid bot token" }); return; }
    const [agent] = await db.insert(agentsTable).values({
      userId: body.userId ?? null,
      name: body.name ?? tgData.result?.first_name ?? "Agent",
      botToken: body.botToken,
      botUsername: tgData.result?.username ?? "",
      botId: tgData.result?.id ?? null,
      apiType: body.apiType,
      apiKey: body.apiKey,
      apiUrl: body.apiUrl ?? null,
      model: body.model,
      userPrompt: body.userPrompt ?? null,
      responseChance: body.responseChance ?? 80,
      minDelaySec: body.minDelaySec ?? 2,
      maxDelaySec: body.maxDelaySec ?? 10,
    }).returning();
    res.status(201).json(agentToJson(agent));
  } catch (err) {
    req.log.error({ err }, "createAgent error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/agents/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parse = UpdateAgentBody.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: "Invalid body" }); return; }
  const updates: Record<string, unknown> = {};
  const b = parse.data;
  if (b.name != null) updates.name = b.name;
  if (b.apiType != null) updates.apiType = b.apiType;
  if (b.apiKey != null) updates.apiKey = b.apiKey;
  if (b.apiUrl != null) updates.apiUrl = b.apiUrl;
  if (b.model != null) updates.model = b.model;
  if (b.userPrompt != null) updates.userPrompt = b.userPrompt;
  if (b.responseChance != null) updates.responseChance = b.responseChance;
  if (b.minDelaySec != null) updates.minDelaySec = b.minDelaySec;
  if (b.maxDelaySec != null) updates.maxDelaySec = b.maxDelaySec;
  if (b.active != null) updates.active = b.active;
  const [agent] = await db.update(agentsTable).set(updates).where(eq(agentsTable.id, id)).returning();
  if (!agent) { res.status(404).json({ error: "Not found" }); return; }
  res.json(agentToJson(agent));
});

router.delete("/agents/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(channelAgentsTable).where(eq(channelAgentsTable.agentId, id));
  await db.delete(agentsTable).where(eq(agentsTable.id, id));
  res.json({ success: true, message: null });
});

function agentToJson(a: typeof agentsTable.$inferSelect) {
  return {
    id: a.id, userId: a.userId, name: a.name, botUsername: a.botUsername, botId: a.botId,
    apiType: a.apiType, model: a.model, apiUrl: a.apiUrl, userPrompt: a.userPrompt,
    responseChance: a.responseChance, minDelaySec: a.minDelaySec, maxDelaySec: a.maxDelaySec,
    active: a.active, webhookRegistered: a.webhookRegistered, createdAt: a.createdAt.toISOString(),
  };
}

export default router;
