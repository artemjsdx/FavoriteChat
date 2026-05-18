import { pgTable, text, serial, bigint, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const agentsTable = pgTable("agents", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  name: text("name").notNull(),
  botToken: text("bot_token").notNull().unique(),
  botUsername: text("bot_username").notNull(),
  botId: bigint("bot_id", { mode: "number" }),
  apiType: text("api_type").notNull().default("openrouter"),
  apiKey: text("api_key").notNull(),
  apiUrl: text("api_url"),
  model: text("model").notNull(),
  userPrompt: text("user_prompt"),
  responseChance: integer("response_chance").notNull().default(80),
  minDelaySec: integer("min_delay_sec").notNull().default(2),
  maxDelaySec: integer("max_delay_sec").notNull().default(10),
  active: boolean("active").notNull().default(true),
  webhookRegistered: boolean("webhook_registered").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAgentSchema = createInsertSchema(agentsTable).omit({ id: true, createdAt: true });
export type InsertAgent = z.infer<typeof insertAgentSchema>;
export type Agent = typeof agentsTable.$inferSelect;
