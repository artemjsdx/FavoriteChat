import { pgTable, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { agentsTable } from "./agents";
import { channelsTable } from "./channels";

export const channelAgentsTable = pgTable("channel_agents", {
  id: serial("id").primaryKey(),
  channelId: integer("channel_id").notNull().references(() => channelsTable.id, { onDelete: "cascade" }),
  agentId: integer("agent_id").notNull().references(() => agentsTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertChannelAgentSchema = createInsertSchema(channelAgentsTable).omit({ id: true, createdAt: true });
export type InsertChannelAgent = z.infer<typeof insertChannelAgentSchema>;
export type ChannelAgent = typeof channelAgentsTable.$inferSelect;
