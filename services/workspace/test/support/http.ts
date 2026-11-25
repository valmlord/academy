import { Writable } from "node:stream";
import { CourseLessons } from "../../src/course/lessons.js";
import { type AppDeps, type BuiltApp, buildApp } from "../../src/http/app.js";
import { IdleTracker } from "../../src/idle.js";
import { KeyedMutex } from "../../src/lock.js";
import { type ManagerOptions, WorkspaceManager } from "../../src/manager.js";
import { TerminalRegistry } from "../../src/terminal/registry.js";
import { FakeRuntime } from "./fake-runtime.js";

// `buildApp` over a manager on the in-memory runtime, with the pino output captured, for the HTTP unit tests.

export const TEST_SECRET = "s3cret-canary-0123456789abcdef-XYZ";
export const AUTHORIZED = { authorization: `Bearer ${TEST_SECRET}` };
export const INSTANCE = "local";
export const T0 = Date.parse("2026-11-03T10:00:00Z");
export const LESSON_IMAGE = "academy-workspace:dev";

export const TEST_COURSE = new CourseLessons([
  {
    courseId: "course-a",
    lessonId: "with-workspace",
    lessonDir: "course-a/01-basics/01-with-workspace",
    workspace: { image: LESSON_IMAGE, starter: "starter" },
    commandChecks: [],
  },
  {
    courseId: "course-a",
    lessonId: "theory-only",
    lessonDir: "course-a/01-basics/02-theory-only",
    workspace: null,
    commandChecks: [],
  },
]);

export interface TestApp extends BuiltApp {
  runtime: FakeRuntime;
  manager: WorkspaceManager;
  terminals: TerminalRegistry;
  /** Every line the terminal registry and its sessions logged. */
  terminalLogs: string[];
  /** Everything pino wrote so far, as the sink received it. */
  logs: () => string;
}

export interface TestAppOverrides extends Partial<Pick<AppDeps, "manager">> {
  /** The default manager's course read; ignored with `manager`. */
  readCourse?: ManagerOptions["readCourse"];
}

export function testApp(overrides: TestAppOverrides = {}): TestApp {
  const runtime = new FakeRuntime(INSTANCE);
  const now = (): number => T0;
  const chunks: string[] = [];
  const logStream = new Writable({
    decodeStrings: false,
    write(chunk: unknown, _encoding, callback): void {
      chunks.push(Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk));
      callback();
    },
  });
  const mutex = new KeyedMutex();
  // The manager and the registry know each other, as in the service; the hooks run only once a stop does.
  const stopHooks = {
    onStopping: (id: string) => terminals.onStopping(id),
    onStopRejected: (id: string) => terminals.onStopRejected(id),
  };
  const manager =
    overrides.manager ??
    new WorkspaceManager({
      runtime,
      readCourse: overrides.readCourse ?? (async () => TEST_COURSE),
      instance: INSTANCE,
      imageOverride: null,
      tracker: new IdleTracker({ stopMinutes: 30, warningMinutes: 5, now }),
      mutex,
      log: { info: () => {}, warn: () => {} },
      now,
      stopHooks,
    });
  const terminalLogs: string[] = [];
  const terminals = new TerminalRegistry({
    runtime,
    workspaces: manager,
    mutex,
    instance: INSTANCE,
    shell: "/bin/sh",
    scrollbackLines: 1000,
    log: { info: (line) => terminalLogs.push(line), warn: (line) => terminalLogs.push(line) },
  });
  const built = buildApp({
    secret: TEST_SECRET,
    manager,
    settings: {
      idleStopMinutes: 30,
      idleWarningMinutes: 5,
      startSlowSeconds: 10,
      hasAgentApiKey: false,
    },
    limits: { nanoCpus: 2_000_000_000, memoryBytes: 2 * 1024 ** 3, pidsLimit: 512 },
    terminals,
    logStream,
  });
  return { ...built, runtime, manager, terminals, terminalLogs, logs: () => chunks.join("") };
}
