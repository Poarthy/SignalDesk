import sourcesJson from "../../lib/sources.json";
import type { SourceDef } from "../../lib/types";
import type { MobileRequest } from "../request";
import { jsonResponse } from "../request";
import { rescheduleMobileRefresh } from "../scheduler";
import { readMobileSettings, validateMobileSettingsPatch, writeMobileSettings } from "../storage";

const registry = sourcesJson.sources as SourceDef[];

export async function handleMobileSettings(request: MobileRequest): Promise<Response> {
  if (request.method === "GET") {
    return jsonResponse({ settings: await readMobileSettings(), registry });
  }
  if (request.method !== "PATCH") {
    return jsonResponse({ error: `Method ${request.method} not allowed` }, { status: 405, headers: { allow: "GET, PATCH" } });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonResponse({ error: "Body must be a JSON object" }, { status: 400 });
  }
  const result = validateMobileSettingsPatch(body as Record<string, unknown>);
  if (!result.ok) return jsonResponse({ error: result.error }, { status: 400 });

  const settings = await writeMobileSettings(result.patch);
  await rescheduleMobileRefresh();
  return jsonResponse({ settings });
}
