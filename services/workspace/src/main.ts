import { type Config, loadConfig } from "./config.js";
import { readCourseLessons } from "./course/lessons.js";
import { DockerEngine } from "./docker/engine.js";
import { DockerRuntime } from "./docker/runtime.js";
import { InvalidConfigError } from "./errors.js";
import { buildApp } from "./http/app.js";
import { IdleTracker } from "./idle.js";
import { KeyedMutex } from "./lock.js";
import { errorKindAndCode } from "./log-fields.js";
import { type ServiceLog, WorkspaceManager } from "./manager.js";
import { Reconciler } from "./reconcile.js";
import { TerminalRegistry } from "./terminal/registry.js";

// Startup order: configuration (exit 1 naming the variable), the HTTP server (it listens even while Docker is
// down, answering 503), then reconcile and the timers. SIGTERM and SIGINT clear the timers and close the
// server, so no idle stop or reconcile starts during shutdown; terminal sessions end with 1001 before the server
// closes.

/** Design 6.4: often enough that a workspace stops within half a minute of its idle time. */
const IDLE_SWEEP_INTERVAL_MS = 30_000;
/** Design 6.5: GC of orphans and re-adoption are not urgent; the startup pass covers a restart. */
const RECONCILE_INTERVAL_MS = 5 * 60_000;

/** The configuration, or `null` after printing the broken rule (never the value). */
function readConfig(): Config | null {
  try {
    return loadConfig(process.env);
  } catch (error: unknown) {
    if (!(error instanceof InvalidConfigError)) throw error;
    console.error(`workspace: invalid configuration: ${error.message}`);
    return null;
  }
}

/** Runs `task` every `intervalMs`, skipping a tick while the previous run is still going. */
function every(intervalMs: number, task: () => Promise<void>): NodeJS.Timeout {
  let isRunning = false;
  return setInterval(() => {
    if (isRunning) return;
    isRunning = true;
    void task().finally(() => {
      isRunning = false;
    });
  }, intervalMs);
}

async function main(): Promise<void> {
  const config = readConfig();
  if (config === null) {
    process.exitCode = 1;
    return;
  }
  const runtime = new DockerRuntime({
    engine: new DockerEngine(),
    instance: config.instance,
    courseRoot: config.courseRoot,
    limits: config.limits,
  });
  const tracker = new IdleTracker({
    stopMinutes: config.idleStopMinutes,
    warningMinutes: config.idleWarningMinutes,
    now: Date.now,
  });
  const mutex = new KeyedMutex();
  const readCourse = () => readCourseLessons(config.courseRoot);
  // The manager and reconcile log through Fastify's logger, which exists only once the app is built.
  const logTarget: { current: ServiceLog } = { current: console };
  const log: ServiceLog = {
    info: (message) => logTarget.current.info(message),
    warn: (message) => logTarget.current.warn(message),
  };
  const manager = new WorkspaceManager({
    runtime,
    readCourse,
    instance: config.instance,
    imageOverride: config.imageOverride,
    tracker,
    mutex,
    log,
    now: Date.now,
    // The registry is built just below; a stop reaches these hooks only after the server is listening.
    stopHooks: {
      onStopping: (id) => terminals.onStopping(id),
      onStopRejected: (id) => terminals.onStopRejected(id),
    },
  });
  const terminals = new TerminalRegistry({
    runtime,
    workspaces: manager,
    mutex,
    instance: config.instance,
    shell: config.terminalShell,
    scrollbackLines: config.terminalScrollbackLines,
    log,
  });
  const reconciler = new Reconciler({
    runtime,
    readCourse,
    instance: config.instance,
    tracker,
    mutex,
    log,
  });
  const { app } = buildApp({
    secret: config.secret,
    manager,
    settings: {
      idleStopMinutes: config.idleStopMinutes,
      idleWarningMinutes: config.idleWarningMinutes,
      startSlowSeconds: config.startSlowSeconds,
    },
    limits: config.limits,
    terminals,
  });
  logTarget.current = app.log;

  await app.listen({ host: config.host, port: config.port });
  const timers = [
    every(IDLE_SWEEP_INTERVAL_MS, () => manager.sweepIdle()),
    every(RECONCILE_INTERVAL_MS, () => reconciler.runPass()),
  ];
  const shutdown = (signal: NodeJS.Signals): void => {
    app.log.info(`workspace: ${signal}, shutting down`);
    for (const timer of timers) clearInterval(timer);
    terminals.closeAll();
    void app.close().then(() => {
      process.exitCode = 0;
    });
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
  await reconciler.runPass();
}

main().catch((error: unknown) => {
  console.error(`workspace: startup failed: ${errorKindAndCode(error)}`);
  process.exit(1);
});
