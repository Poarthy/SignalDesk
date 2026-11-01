export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureStore } = await import("./server/store");
    const { scheduler } = await import("./server/scheduler");
    await ensureStore();
    await scheduler.init();
  }
}
