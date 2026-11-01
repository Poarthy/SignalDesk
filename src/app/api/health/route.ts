import { readNews } from "@/server/store";
import { refreshManager } from "@/server/refreshManager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const data = await readNews();
  return Response.json({
    ok: true,
    node: process.version,
    uptimeSec: Math.round(process.uptime()),
    stories: data?.itemCount ?? 0,
    generatedAt: data?.generatedAt ?? null,
    refreshing: refreshManager.isRunning(),
  });
}
