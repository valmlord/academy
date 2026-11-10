import type { Duplex } from "node:stream";
import { setTimeout as sleep } from "node:timers/promises";
import { describe, expect, it } from "vitest";
import { DockerEngine } from "../../src/docker/engine.js";
import { DockerRuntime } from "../../src/docker/runtime.js";
import type { WorkspaceKey } from "../../src/identity.js";
import type { ShellHandle } from "../../src/runtime.js";
import { docker } from "./docker-cli.js";
import { FIXTURE_COURSE_ROOT, fixtureSpec, TEST_LIMITS } from "./fixtures.js";
import { onCleanup, useTestInstance } from "./harness.js";

// The terminal's exec primitives on the real daemon (design 3.2, 10.2): what the shell runs as, that an idle
// shell outlives docker-modem's 30 s inactivity timeout, and that destroying the stream does NOT end the shell
// (residual R-orphan, accepted as D16; this test turns red if Docker starts killing the exec, see follow-up 7.6).

const { instance } = useTestInstance("terminal-exec.int.test.ts");

const key: WorkspaceKey = {
  userId: "exec-user",
  courseId: "sample-course",
  lessonId: "with-workspace",
};
const SHELL = { shell: "/bin/sh" };
const OUTPUT_TIMEOUT_MS = 10_000;
/** Longer than the engine's 30 s inactivity timeout (`ENGINE_TIMEOUT_MS`). */
const IDLE_MS = 40_000;
const IDLE_TEST_TIMEOUT_MS = 120_000;
/** How long the shell's child may take to show up in `ps` after it was typed. */
const START_DEADLINE_MS = 10_000;
/** I-exec-close-orphans: the time Docker gets to end the exec after its connection closed (design 10.2). */
const ORPHAN_WAIT_MS = 10_000;
const ORPHAN_TEST_TIMEOUT_MS = 90_000;
const POLL_MS = 250;
const SHELL_COMMAND = "/bin/sh -l";
const SLEEP_COMMAND = "sleep 4242";
/** I-exec-echo's `ids` line: the shell's pid, then its process group, session and pid file, all equal. */
const SESSION_IDS = /(^|\n)ids (\d+) \2 \2 \2\r?\n/;

/** Everything the shell printed so far, and a wait for a pattern in it. */
interface ShellOutput {
  text(): string;
  waitFor(pattern: RegExp): Promise<void>;
}

function collect(stream: Duplex): ShellOutput {
  let text = "";
  stream.on("data", (chunk: Buffer) => {
    text += chunk.toString("utf8");
  });
  return {
    text: () => text,
    async waitFor(pattern) {
      const deadline = Date.now() + OUTPUT_TIMEOUT_MS;
      while (!pattern.test(text)) {
        if (Date.now() > deadline) {
          throw new Error(
            `no ${pattern.source} in the shell output within ${OUTPUT_TIMEOUT_MS} ms`,
          );
        }
        await sleep(POLL_MS);
      }
    },
  };
}

/** A line that is exactly `value`, not the echoed command that printed it. */
function line(value: string): RegExp {
  return new RegExp(`(^|\\n)${value.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}\\r?\\n`);
}

async function openShell(): Promise<{
  shell: ShellHandle;
  output: ShellOutput;
  containerId: string;
}> {
  const runtime = new DockerRuntime({
    engine: new DockerEngine(),
    instance,
    courseRoot: FIXTURE_COURSE_ROOT,
    limits: TEST_LIMITS,
  });
  const containerId = (await runtime.ensureRunning(fixtureSpec(key))).workspace.containerId;
  if (containerId === null) throw new Error("ensureRunning returned no container");
  const shell = await runtime.openShell(key, SHELL);
  onCleanup(() => {
    shell.stream.destroy();
  });
  return { shell, output: collect(shell.stream), containerId };
}

/** The command line of every process in the container, one per entry. */
async function processes(containerId: string): Promise<string[]> {
  const listing = await docker(["exec", containerId, "ps", "-o", "args"]);
  return listing.split("\n").map((entry) => entry.trim());
}

async function waitForProcess(containerId: string, command: string): Promise<boolean> {
  const deadline = Date.now() + START_DEADLINE_MS;
  while (Date.now() <= deadline) {
    if ((await processes(containerId)).includes(command)) return true;
    await sleep(POLL_MS);
  }
  return false;
}

describe("terminal exec on the real daemon", () => {
  it("I-exec-echo: runs the shell as uid 1000 in the work directory with TERM set", async () => {
    const { shell, output } = await openShell();

    shell.stream.write("echo ok\r");
    await output.waitFor(line("ok"));
    shell.stream.write("id -u\r");
    await output.waitFor(line("1000"));
    shell.stream.write("pwd\r");
    await output.waitFor(line("/workspace/home/work"));
    shell.stream.write("echo $TERM\r");
    await output.waitFor(line("xterm-256color"));
    // pid, process group, session and the pid file: all one number (#110). The echoed command line holds `$1` etc.,
    // not digits, so only the output matches.
    shell.stream.write(
      'read -r s < /proc/$$/stat; set -- $s; echo "ids $1 $5 $6 $(cat /tmp/.terminal-*.pid)"\r',
    );
    await output.waitFor(SESSION_IDS);

    expect(output.text()).toMatch(line("ok"));
    expect(output.text()).toMatch(line("1000"));
    expect(output.text()).toMatch(line("/workspace/home/work"));
    expect(output.text()).toMatch(line("xterm-256color"));
    expect(output.text()).toMatch(SESSION_IDS);
  });

  it(
    "I-exec-idle: a shell idle for 40 s still answers",
    async () => {
      const { shell, output } = await openShell();
      shell.stream.write("echo ready\r");
      await output.waitFor(line("ready"));

      await sleep(IDLE_MS);
      shell.stream.write("echo alive\r");
      await output.waitFor(line("alive"));

      expect(shell.stream.destroyed).toBe(false);
      expect(output.text()).toMatch(line("alive"));
    },
    IDLE_TEST_TIMEOUT_MS,
  );

  it(
    "I-exec-close-orphans: the shell and its child keep running after the stream is destroyed",
    async () => {
      const { shell, output, containerId } = await openShell();
      shell.stream.write("echo started\r");
      await output.waitFor(line("started"));
      shell.stream.write(`${SLEEP_COMMAND}\r`);
      const started = await waitForProcess(containerId, SLEEP_COMMAND);

      shell.stream.destroy();
      await sleep(ORPHAN_WAIT_MS);
      const after = await processes(containerId);

      expect(started).toBe(true);
      expect(after).toContain(SHELL_COMMAND);
      expect(after).toContain(SLEEP_COMMAND);
    },
    ORPHAN_TEST_TIMEOUT_MS,
  );
});
