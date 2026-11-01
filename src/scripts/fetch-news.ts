/**
 * Build-time refresh — runs automatically before `next build` (see
 * "prebuild" in package.json) and can also be run manually with `npm run news`.
 * It uses the exact same engine and settings as the in-website sync.
 */
import { collectNews } from "../server/newsService";
import { enabledSources, ensureStore, readSettings, writeNews } from "../server/store";

async function main() {
  await ensureStore();
  const settings = await readSettings();
  console.log(
    `[news-hub] build-time refresh: window=${settings.windowHours}h, ${enabledSources(settings).length} sources enabled`
  );
  const data = await collectNews(settings);
  await writeNews(data);
  console.log(`[news-hub] ✓ ${data.itemCount} stories written to data/news.json`);
}

main().catch((err) => {
  console.error("[news-hub] build-time refresh failed (continuing build):", err);
  process.exitCode = 0;
});
