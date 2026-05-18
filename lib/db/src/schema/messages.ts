import { pgTable, text, serial, bigint, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const discussionsTable = pgTable("discussions", {
  id: serial("id").primaryKey(),
  channelId: integer("channel_id").notNull(),
  triggerMessageId: bigint("trigger_message_id", { mode: "number" }).notNull(),
  status: text("status").notNull().default("active"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
});

export const messagesTable = pgTable("messages", {
  id: serial("id").primaryKey(),
  channelId: integer("channel_id").notNull(),
  discussionId: integer("discussion_id"),
  telegramMessageId: bigint("telegram_message_id", { mode: "number" }).notNull(),
  agentId: integer("agent_id"),
  fromUsername: text("from_username"),
  fromName: text("from_name"),
  text: text("text").notNull(),
  replyToMessageId: bigint("reply_to_message_id", { mode: "number" }),
  isAgent: boolean("is_agent").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMessageSchema = createInsertSchema(messagesTable).omit({ id: true, createdAt: true });
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messagesTable.$inferSelect;
export type Discussion = typeof discussionsTable.$inferSelect;
