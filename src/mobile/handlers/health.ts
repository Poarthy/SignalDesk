import type { MobileRequest } from "../request";
import { jsonResponse } from "../request";
import { isMobileRefreshRunning } from "./refresh";
import { readMobileNews } from "../storage";

const startedAt = Date.now();

export async function handleMobileHealth(request: MobileRequest): Promise<Response> {
  if (request.method !== "GET") return jsonResponse({ error: `Method ${request.method} not allowed` }, { status: 405, headers: { allow: "GET" } });
  const digest = await readMobileNews();
  return jsonResponse({
    ok: true,
    node: "mobile",
    uptimeSec: Math.round((Date.now() - startedAt) / 1_000),
    stories: digest?.itemCount ?? 0,
    generatedAt: digest?.generatedAt ?? null,
    refreshing: isMobileRefreshRunning(),
  });
}
