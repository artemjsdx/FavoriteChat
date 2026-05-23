import {
  pgTable,
  serial,
  bigint,
  text,
  boolean,
  integer,
  timestamp,
  jsonb,
  real,
} from "drizzle-orm/pg-core";

export const agentsTable = pgTable("agents", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  botToken: text("bot_token").notNull().unique(),
  botUsername: text("bot_username").notNull().default(""),
  botId: bigint("bot_id", { mode: "number" }),
  apiType: text("api_type").notNull().default("openrouter"),
  apiKey: text("api_key").notNull(),
  apiUrl: text("api_url"),
  model: text("model").notNull(),
  userPrompt: text("user_prompt"),
  responseChance: real("response_chance").notNull().default(80),
  minDelaySec: integer("min_delay_sec").notNull().default(5),
  maxDelaySec: integer("max_delay_sec").notNull().default(20),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const channelsTable = pgTable("channels", {
  id: serial("id").primaryKey(),
  telegramChatId: text("telegram_chat_id").notNull().unique(),
  linkedGroupId: text("linked_group_id"),
  title: text("title").notNull(),
  contextMessages: integer("context_messages").notNull().default(10),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const channelAgentsTable = pgTable("channel_agents", {
  id: serial("id").primaryKey(),
  channelId: integer("channel_id")
    .notNull()
    .references(() => channelsTable.id, { onDelete: "cascade" }),
  agentId: integer("agent_id")
    .notNull()
    .references(() => agentsTable.id, { onDelete: "cascade" }),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const discussionsTable = pgTable("discussions", {
  id: serial("id").primaryKey(),
  channelId: integer("channel_id")
    .notNull()
    .references(() => channelsTable.id),
  triggerMessageId: integer("trigger_message_id").notNull(),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  endedAt: timestamp("ended_at"),
});

export const messagesTable = pgTable("messages", {
  id: serial("id").primaryKey(),
  channelId: integer("channel_id")
    .notNull()
    .references(() => channelsTable.id),
  discussionId: integer("discussion_id")
    .notNull()
    .references(() => discussionsTable.id),
  telegramMessageId: integer("telegram_message_id"),
  agentId: integer("agent_id").references(() => agentsTable.id),
  fromUsername: text("from_username"),
  fromName: text("from_name"),
  text: text("text").notNull(),
  replyToMessageId: integer("reply_to_message_id"),
  isAgent: boolean("is_agent").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const settingsTable = pgTable("settings", {
  id: serial("id").primaryKey(),
  favoriteApiUrl: text("favorite_api_url"),
  defaultContextMessages: integer("default_context_messages").notNull().default(10),
  debugMode: boolean("debug_mode").notNull().default(false),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const botSessionsTable = pgTable("bot_sessions", {
  chatId: bigint("chat_id", { mode: "number" }).primaryKey(),
  step: text("step").notNull().default("idle"),
  data: jsonb("data").notNull().default({}),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
