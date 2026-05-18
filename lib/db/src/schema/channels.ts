import { pgTable, text, serial, bigint, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const channelsTable = pgTable("channels", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  telegramChatId: text("telegram_chat_id").notNull().unique(),
  linkedGroupId: text("linked_group_id"),
  title: text("title").notNull(),
  type: text("type").notNull().default("channel"),
  contextMessages: integer("context_messages").notNull().default(10),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const channelAgentsTable = pgTable("channel_agents", {
  id: serial("id").primaryKey(),
  channelId: integer("channel_id").notNull(),
  agentId: integer("agent_id").notNull(),
  priority: integer("priority").notNull().default(0),
  active: boolean("active").notNull().default(true),
});

export const insertChannelSchema = createInsertSchema(channelsTable).omit({ id: true, createdAt: true });
export type InsertChannel = z.infer<typeof insertChannelSchema>;
export type Channel = typeof channelsTable.$inferSelect;
export type ChannelAgent = typeof channelAgentsTable.$inferSelect;
