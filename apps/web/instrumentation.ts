// Runs once at server start, in next dev and in the standalone server, never during next build; the
// server holds requests until register() returns. The Node-only code sits in its own module, so the
// edge bundle never sees process.exit.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { runStartup } = await import("./lib/startup-node");
    await runStartup();
  }
}
