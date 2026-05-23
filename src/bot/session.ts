import { db, botSessionsTable } from "../db/index.js";
import { eq } from "drizzle-orm";

export interface SessionData {
  step: string;
  data: Record<string, unknown>;
  menuMessageId?: number;
}

export const defaultSession = (): SessionData => ({ step: "idle", data: {} });

export const sessionStorage = {
  async read(key: string): Promise<SessionData | undefined> {
    const chatId = parseInt(key);
    const [row] = await db.select().from(botSessionsTable).where(eq(botSessionsTable.chatId, chatId));
    if (!row) return undefined;
    return { step: row.step, data: row.data as Record<string, unknown> };
  },

  async write(key: string, value: SessionData): Promise<void> {
    const chatId = parseInt(key);
    await db
      .insert(botSessionsTable)
      .values({ chatId, step: value.step, data: value.data })
      .onConflictDoUpdate({
        target: botSessionsTable.chatId,
        set: { step: value.step, data: value.data, updatedAt: new Date() },
      });
  },

  async delete(key: string): Promise<void> {
    const chatId = parseInt(key);
    await db.delete(botSessionsTable).where(eq(botSessionsTable.chatId, chatId));
  },
};
