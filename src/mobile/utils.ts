export const FEED_TIMEOUT_MS = 15_000;
export const TRANSLATION_TIMEOUT_MS = 10_000;

export function nowMs(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

export async function sha1(value: string): Promise<string> {
  try {
    const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  } catch {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(12, "0");
  }
}

export async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export function describeError(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; current && depth < 6; depth += 1) {
    if (current instanceof Error) {
      if (current.message && !parts.includes(current.message)) parts.push(current.message);
      current = (current as Error & { cause?: unknown }).cause;
    } else if (typeof current === "string") {
      if (current && !parts.includes(current)) parts.push(current);
      break;
    } else {
      break;
    }
  }
  return parts.join(" -> ") || "unknown error";
}

function decodeCodePoint(code: number): string {
  return Number.isInteger(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
}

export function stripHtml(value = ""): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<!\[CDATA\[|\]\]>/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, number: string) => decodeCodePoint(parseInt(number, 16)))
    .replace(/&#(\d+);/g, (_, number: string) => decodeCodePoint(Number(number)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&zwnj;/gi, "\u200c")
    .replace(/\s+/g, " ")
    .trim();
}

export function excerpt(text: string, limit = 180): string {
  return text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text;
}
