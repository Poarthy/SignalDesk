import type { MobileRequest } from "../request";
import { jsonResponse } from "../request";
import { emptyMobileNews, readMobileNews, readMobileSettings } from "../storage";

export async function handleMobileNews(request: MobileRequest): Promise<Response> {
  if (request.method !== "GET") return jsonResponse({ error: `Method ${request.method} not allowed` }, { status: 405, headers: { allow: "GET" } });
  const digest = await readMobileNews();
  if (digest) return jsonResponse(digest, { headers: { "cache-control": "no-cache" } });
  const settings = await readMobileSettings();
  return jsonResponse(emptyMobileNews(settings.windowHours), { headers: { "cache-control": "no-cache" } });
}
