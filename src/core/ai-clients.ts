export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AIResult {
  text: string;
  error?: string;
}

interface AICallOpts {
  apiType: string;
  apiKey: string;
  apiUrl?: string | null;
  model: string;
  messages: ChatMessage[];
}

// Global queue for FavoriteAPI — 1 request at a time per URL
const favoriteQueues = new Map<string, Promise<void>>();

async function enqueueFavorite<T>(url: string, fn: () => Promise<T>): Promise<T> {
  const prev = favoriteQueues.get(url) ?? Promise.resolve();
  let resolve!: () => void;
  const next = new Promise<void>((r) => { resolve = r; });
  favoriteQueues.set(url, next);
  await prev;
  try {
    return await fn();
  } finally {
    resolve();
  }
}

async function callFavoriteAPI(opts: AICallOpts, retries = 3): Promise<AIResult> {
  const url = (opts.apiUrl ?? "").replace(/\/$/, "");
  if (!url) return { text: "", error: "FavoriteAPI URL не задан" };

  return enqueueFavorite(url, async () => {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const res = await fetch(`${url}/api/v1/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${opts.apiKey}`,
          },
          body: JSON.stringify({
            model: opts.model,
            messages: opts.messages.filter((m) => m.role !== "system"),
          }),
          signal: AbortSignal.timeout(90_000),
        });

        const json = (await res.json()) as Record<string, unknown>;

        if (!res.ok) {
          const code = (json as { log_code?: string }).log_code ?? "";
          if (code === "KEY_BUSY_301" && attempt < retries) {
            await new Promise((r) => setTimeout(r, 15_000));
            continue;
          }
          return { text: "", error: `FavoriteAPI error: ${json.error ?? res.status} (${code})` };
        }

        const choices = (json as { choices?: Array<{ message?: { content?: string } }> }).choices;
        const text = choices?.[0]?.message?.content ?? "";
        return { text };
      } catch (err) {
        if (attempt === retries) return { text: "", error: String(err) };
        await new Promise((r) => setTimeout(r, 5_000));
      }
    }
    return { text: "", error: "Max retries exceeded" };
  });
}

async function callOpenRouter(opts: AICallOpts): Promise<AIResult> {
  try {
    const messages = opts.messages.map((m) => ({ role: m.role, content: m.content }));
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${opts.apiKey}`,
        "HTTP-Referer": "https://github.com/artemjsdx/FavoriteChat",
        "X-Title": "FavoriteChat",
      },
      body: JSON.stringify({ model: opts.model, messages }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      return { text: "", error: `OpenRouter ${res.status}: ${(err.error as Record<string,unknown>)?.message ?? res.statusText}` };
    }

    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = json.choices?.[0]?.message?.content ?? "";
    return { text };
  } catch (err) {
    return { text: "", error: String(err) };
  }
}

export async function callAI(opts: AICallOpts): Promise<AIResult> {
  if (opts.apiType === "favorite") return callFavoriteAPI(opts);
  return callOpenRouter(opts);
}
