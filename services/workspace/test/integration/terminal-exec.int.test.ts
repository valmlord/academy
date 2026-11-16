import type { Duplex } from "node:stream";
import { setTimeout as sleep } from "node:timers/promises";
import { describe, expect, it } from "vitest";
import { DockerEngine } from "../../src/docker/engine.js";
import { DockerRuntime } from "../../src/docker/runtime.js";
import type { WorkspaceKey } from "../../src/identity.js";
import type { ShellHandle } from "../../src/runtime.js";
import { docker, inspectObject, processArgs } from "./docker-cli.js";
import { FIXTURE_COURSE_ROOT, fixtureSpec, TEST_LIMITS } from "./fixtures.js";
import { onCleanup, useTestInstance } from "./harness.js";

// The terminal's exec primitives on the real daemon (design 3.2, 10.2, #110): what the shell runs as, that its pid
// file names its session, that an idle shell outlives docker-modem's 30 s inactivity timeout, that the kill
// refuses session 1, and that the agent key is in the shell's environment only when configured and is not in a
// separate `docker exec`'s environment or in PID 1's `/proc/1/environ` (#115).

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
/** KILL_GRACE_SECONDS in src/docker/spec.ts: the kill script's wait between HUP and KILL. */
const KILL_GRACE_MS = 2_000;
/** After the grace: time for the kill exec to start, run both signals and for the container to stop if it would. */
const KILL_SETTLE_MS = 2_000;
const POLL_MS = 250;
const SHELL_COMMAND = "/bin/sh -l";
const KEEPER_COMMAND = "sleep infinity";
/** A fake value with no real key's prefix. */
const AGENT_KEY = "t115-fake-agent-key-not-real";
/** Prints the agent CLI's key variable, or `unset`, as one line. */
const PRINT_AGENT_KEY = `printf 'k=%s\\n' "\${ANTHROPIC_API_KEY:-unset}"`;
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

async function openShell(agentApiKey: string | null = null): Promise<{
  shell: ShellHandle;
  output: ShellOutput;
  containerId: string;
}> {
  const runtime = new DockerRuntime({
    engine: new DockerEngine(),
    instance,
    courseRoot: FIXTURE_COURSE_ROOT,
    limits: TEST_LIMITS,
    agentApiKey,
  });
  const containerId = (await runtime.ensureRunning(fixtureSpec(key))).workspace.containerId;
  if (containerId === null) throw new Error("ensureRunning returned no container");
  const shell = await runtime.openShell(key, SHELL);
  onCleanup(() => {
    shell.stream.destroy();
  });
  return { shell, output: collect(shell.stream), containerId };
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
    shell.stream.write(`${PRINT_AGENT_KEY}\r`);
    await output.waitFor(line("k=unset"));

    expect(output.text()).toMatch(line("ok"));
    expect(output.text()).toMatch(line("1000"));
    expect(output.text()).toMatch(line("/workspace/home/work"));
    expect(output.text()).toMatch(line("xterm-256color"));
    expect(output.text()).toMatch(SESSION_IDS);
    expect(output.text()).toMatch(line("k=unset"));
  });

  it("I-exec-agent-key: the key reaches the shell, not a sibling exec or PID 1", async () => {
    const { shell, output, containerId } = await openShell(AGENT_KEY);

    shell.stream.write(`${PRINT_AGENT_KEY}\r`);
    await output.waitFor(line(`k=${AGENT_KEY}`));
    const sibling = await docker(["exec", containerId, "sh", "-c", PRINT_AGENT_KEY]);
    // PID 1 is docker-init: its environment is the container's, so HOME proves the read worked.
    const initEnvironment = await docker([
      "exec",
      containerId,
      "sh",
      "-c",
      "tr '\\0' '\\n' < /proc/1/environ",
    ]);

    expect(output.text()).toMatch(line(`k=${AGENT_KEY}`));
    expect.soft(sibling).toBe("k=unset\n");
    expect.soft(initEnvironment).toContain("HOME=/workspace/home");
    expect.soft(initEnvironment).not.toContain(AGENT_KEY);
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

  it("I-exec-kill-refuses-init: a pid file rewritten to 1 does not stop the container", async () => {
    const { shell, output, containerId } = await openShell();
    // A loop, because busybox ash may not glob a redirection target.
    shell.stream.write('for f in /tmp/.terminal-*.pid; do echo 1 > "$f"; done; echo tampered\r');
    await output.waitFor(line("tampered"));

    await shell.terminate();
    await sleep(KILL_GRACE_MS + KILL_SETTLE_MS);

    expect((await inspectObject("container", containerId))?.state).toBe("running");
    const listing = await processArgs(containerId);
    expect(listing, listing.join("\n")).toContain(KEEPER_COMMAND);
    expect(listing, listing.join("\n")).toContain(SHELL_COMMAND);
  });
});
