import PQueue from "p-queue";
import { logger } from "./logger";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AIResponse {
  text: string;
  error?: string;
}

const favoriteQueues = new Map<string, PQueue>();

function getFavoriteQueue(apiKey: string): PQueue {
  if (!favoriteQueues.has(apiKey)) {
    favoriteQueues.set(apiKey, new PQueue({ concurrency: 1 }));
  }
  return favoriteQueues.get(apiKey)!;
}

async function callFavoriteWithRetry(
  apiUrl: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  retries = 3
): Promise<AIResponse> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(`${apiUrl}/api/v1/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model, messages }),
        signal: AbortSignal.timeout(60_000),
      });

      if (res.status === 301) {
        logger.warn({ attempt }, "FavoriteAPI KEY_BUSY_301 — retrying in 3s");
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }

      if (!res.ok) {
        const body = await res.text();
        return { text: "", error: `HTTP ${res.status}: ${body}` };
      }

      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      return { text: data.choices?.[0]?.message?.content ?? "" };
    } catch (err) {
      logger.error({ err, attempt }, "FavoriteAPI request error");
      if (attempt === retries - 1) return { text: "", error: String(err) };
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  return { text: "", error: "Max retries exceeded" };
}

export async function callFavoriteApi(
  apiUrl: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[]
): Promise<AIResponse> {
  const queue = getFavoriteQueue(apiKey);
  return queue.add(() => callFavoriteWithRetry(apiUrl, apiKey, model, messages)) as Promise<AIResponse>;
}

export async function callOpenRouter(
  apiKey: string,
  model: string,
  messages: ChatMessage[]
): Promise<AIResponse> {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://favoritechat.app",
        "X-Title": "FavoriteChat",
      },
      body: JSON.stringify({ model, messages }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) {
      const body = await res.text();
      return { text: "", error: `HTTP ${res.status}: ${body}` };
    }

    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return { text: data.choices?.[0]?.message?.content ?? "" };
  } catch (err) {
    logger.error({ err }, "OpenRouter request error");
    return { text: "", error: String(err) };
  }
}

export async function callAI(opts: {
  apiType: string;
  apiKey: string;
  apiUrl?: string | null;
  model: string;
  messages: ChatMessage[];
}): Promise<AIResponse> {
  const { apiType, apiKey, apiUrl, model, messages } = opts;

  if (apiType === "favorite") {
    if (!apiUrl) return { text: "", error: "FavoriteAPI: apiUrl not set" };
    return callFavoriteApi(apiUrl, apiKey, model, messages);
  }

  return callOpenRouter(apiKey, model, messages);
}
