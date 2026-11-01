import type { NewsData, RefreshEvent, Settings, SettingsPayload } from "./types";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

export async function fetchNews(signal?: AbortSignal): Promise<NewsData> {
  const res = await fetch("/api/news", { signal });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      detail = body?.error ?? detail;
    } catch { /* not json */ }
    throw new ApiError(res.status, detail);
  }
  return res.json();
}

export async function fetchSettingsPayload(): Promise<SettingsPayload> {
  const res = await fetch("/api/settings", { cache: "no-store" });
  if (!res.ok) throw new ApiError(res.status, "Failed to load settings");
  return res.json();
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const res = await fetch("/api/settings", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      message = body?.error ?? message;
    } catch { /* not json */ }
    throw new ApiError(res.status, message);
  }
  const body = await res.json();
  return body.settings as Settings;
}

/** Translates up to 5 text segments from English to Persian via /api/translate. */
export async function translateTexts(texts: string[]): Promise<string[]> {
  const res = await fetch("/api/translate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ texts }),
  });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      message = body?.error ?? message;
    } catch { /* not json */ }
    throw new ApiError(res.status, message);
  }
  const body = await res.json();
  return body.translations as string[];
}

/**
 * Streams NDJSON events from the refresh endpoint and invokes onEvent for
 * each one. Rejects if the server reports an error event.
 */
export async function streamRefresh({
  onEvent,
  signal,
}: {
  onEvent: (event: RefreshEvent) => void;
  signal?: AbortSignal;
}): Promise<void> {
  const res = await fetch("/api/news/refresh", { method: "POST", signal });
  if (!res.ok || !res.body) throw new ApiError(res.status, "Refresh request failed");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        const event = JSON.parse(line) as RefreshEvent;
        onEvent(event);
        if (event.type === "error") throw new Error(event.message || "Refresh failed");
      }
    }
    const tail = buffer.trim();
    if (tail) {
      const event = JSON.parse(tail) as RefreshEvent;
      onEvent(event);
      if (event.type === "error") throw new Error(event.message || "Refresh failed");
    }
  } finally {
    reader.releaseLock();
  }
}
