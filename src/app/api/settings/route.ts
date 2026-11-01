import { NextRequest } from "next/server";
import { SOURCES, readSettings, validateSettingsPatch, writeSettings } from "@/server/store";
import { scheduler } from "@/server/scheduler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const settings = await readSettings();
  return Response.json({
    settings,
    registry: SOURCES,
  });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "Body must be a JSON object" }, { status: 400 });
  }
  const result = validateSettingsPatch(body as Record<string, unknown>);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 400 });
  }
  const settings = await writeSettings(result.patch);
  await scheduler.reschedule();
  return Response.json({ settings });
}
