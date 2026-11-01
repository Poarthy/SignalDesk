import { NextRequest } from "next/server";
import { newsFileMeta, readNews } from "@/server/store";
import { refreshManager } from "@/server/refreshManager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const meta = await newsFileMeta();
  if (!meta) {
    return Response.json(
      { error: "No news yet", refreshing: refreshManager.isRunning() },
      { status: 503, headers: { "cache-control": "no-store" } }
    );
  }

  const etag = `W/"${meta.mtimeMs.toString(36)}-${meta.size.toString(36)}"`;
  if (req.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: { etag, "cache-control": "no-cache" } });
  }

  const data = await readNews();
  if (!data) {
    return Response.json({ error: "No news yet" }, { status: 503 });
  }
  return new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-cache", etag },
  });
}
