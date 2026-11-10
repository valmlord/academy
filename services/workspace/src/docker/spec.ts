import type { WorkspaceLimits } from "../config.js";
import {
  LEARNER_GID,
  LEARNER_HOME,
  LEARNER_UID,
  WORK_DIR,
  WORKSPACE_MOUNT,
  type WorkspaceKey,
  type WorkspaceNames,
  workspaceLabels,
} from "../identity.js";

// The create body of a workspace container (design 4.5). Every key is on an exact allowlist that U-spec pins
// with its value: adding a key, here or in a later change, is a reviewed change of that guard.

/** What the builder needs, from the types of config and identity only. */
export interface ContainerSpecInput {
  image: string;
  /** The labels carry it; the names alone do not expose it as a field. */
  instance: string;
  key: WorkspaceKey;
  names: WorkspaceNames;
  limits: WorkspaceLimits;
}

/** If the VM itself runs out of memory, the kernel picks a workspace before Postgres; raising needs no privilege. */
const OOM_SCORE_ADJ = 500;
/**
 * Scratch space beside a read-only rootfs. `exec` because `$HOME` on the volume is executable anyway, so
 * `noexec` would add no boundary and would break tools that run build steps from `/tmp`.
 */
const TMP_MOUNT_OPTIONS = "rw,nosuid,nodev,exec,size=256m,mode=1777";
/**
 * The tmpfs mount point, also the directory of the terminal pid files (#110): the only writable path beside the
 * read-only rootfs that is wiped at container stop, so a stale pid file never names a process of a later start.
 */
const SCRATCH_DIR = "/tmp";
/** Seconds between SIGTERM and SIGKILL on a stop, the container's and the service's: lets an agent flush its transcript. */
export const STOP_TIMEOUT_SECONDS = 10;
/** Keeps the container alive; every process comes from exec (#32). */
const KEEPER_COMMAND = ["sleep", "infinity"];

export interface ContainerCreateBody {
  Image: string;
  User: string;
  Env: string[];
  WorkingDir: string;
  Cmd: string[];
  Labels: Record<string, string>;
  StopTimeout: number;
  HostConfig: {
    NanoCpus: number;
    Memory: number;
    /** Equal to `Memory`: a limit hit is an immediate OOM kill, not a crawl through swap. */
    MemorySwap: number;
    PidsLimit: number;
    OomScoreAdj: number;
    Tmpfs: Record<string, string>;
    CapDrop: string[];
    SecurityOpt: string[];
    ReadonlyRootfs: boolean;
    Init: boolean;
    RestartPolicy: { Name: "no" };
    NetworkMode: string;
    Mounts: Array<{
      Type: "volume";
      Source: string;
      Target: string;
      VolumeOptions: { NoCopy: boolean };
    }>;
  };
}

export function buildContainerSpec(input: ContainerSpecInput): ContainerCreateBody {
  return {
    Image: input.image,
    // Numeric, so no passwd entry in the image is needed or trusted.
    User: `${LEARNER_UID}:${LEARNER_GID}`,
    // Exactly this one variable: nothing else from the service's environment reaches a workspace in #31.
    Env: [`HOME=${LEARNER_HOME}`],
    WorkingDir: WORK_DIR,
    Cmd: [...KEEPER_COMMAND],
    Labels: workspaceLabels(input.instance, input.key, "container"),
    StopTimeout: STOP_TIMEOUT_SECONDS,
    HostConfig: {
      NanoCpus: input.limits.nanoCpus,
      Memory: input.limits.memoryBytes,
      MemorySwap: input.limits.memoryBytes,
      PidsLimit: input.limits.pidsLimit,
      OomScoreAdj: OOM_SCORE_ADJ,
      Tmpfs: { [SCRATCH_DIR]: TMP_MOUNT_OPTIONS },
      // git, node, python and an agent CLI need no capability.
      CapDrop: ["ALL"],
      SecurityOpt: ["no-new-privileges:true"],
      // All state lives in the volume, so nothing hides in the container layer.
      ReadonlyRootfs: true,
      // docker-init forwards SIGTERM to the keeper and reaps zombies.
      Init: true,
      // Only the service starts workspaces.
      RestartPolicy: { Name: "no" },
      NetworkMode: input.names.network,
      // Content comes only from the starter tar: `NoCopy` keeps the image's files out of the volume.
      Mounts: [
        {
          Type: "volume",
          Source: input.names.volume,
          Target: WORKSPACE_MOUNT,
          VolumeOptions: { NoCopy: true },
        },
      ],
    },
  };
}

// The exec of a terminal shell (design 3.2, ADR-0002 item 13): exact allowlists like the container create
// body, pinned by U-exec-body. No `Privileged`, no `DetachKeys`: the shell gets nothing the container lacks.
// The kill exec (#110) is a second exact allowlist: no TTY, nothing attached.

/** The size Docker gives the TTY until the browser's first `resize` corrects it (rows, columns). */
const EXEC_CONSOLE_SIZE: [number, number] = [24, 80];
/**
 * Runs the wrapper and the kill script, not `TERMINAL_SHELL`: that may be any shell (zsh, fish) while both scripts
 * are POSIX sh, and every supported image has `/bin/sh` (Ubuntu dash, Alpine busybox ash).
 */
const EXEC_SHELL = "/bin/sh";
/** HUP to KILL, in the container, so the service never waits for it (Stepan, #110 decision 3). */
const KILL_GRACE_SECONDS = 2;
/** The kill script's `$0`: what `ps` and sh's error messages show for it. */
const KILL_SCRIPT_NAME = "terminal-kill";

/**
 * Records the shell's pid, then becomes `TERMINAL_SHELL -l` ($0) in the same process. runc makes every exec a session
 * leader, so that pid is also the session id the kill script signals; no `setsid`, which in a session leader forks and
 * exits 0, ending the terminal at once. `;`, not `&&`: a full `/tmp` must not keep the terminal from opening, and sh's
 * "cannot create" line is then the learner's only hint, so stderr stays visible. $1 is the per-shell tag.
 */
const SHELL_WRAPPER = `echo $$ > "${SCRATCH_DIR}/.terminal-$1.pid"; exec "$0" -l`;

/**
 * Ends every process of the session the pid file of tag $1 names: HUP, the grace, then KILL for HUP-immune and stopped
 * processes, and the file goes last, so it exists only while a kill is still owed. The file is learner-writable: `[`
 * fails on anything that is not an integer, and `-gt 1` refuses session 1 (docker-init and the keeper, whose signal
 * stops the container). A session, not a process group, because job-control shells put each job in its own group.
 */
const KILL_SCRIPT = `f="${SCRATCH_DIR}/.terminal-$1.pid"
read -r sid < "$f"
[ "$sid" -gt 1 ] || exit 3
pkill -HUP -s "$sid"
sleep ${KILL_GRACE_SECONDS}
pkill -KILL -s "$sid"
rm -f "$f"`;

export interface ExecCreateBody {
  AttachStdin: true;
  AttachStdout: true;
  AttachStderr: true;
  Tty: true;
  /** The wrapper, then its $0 (the shell) and $1 (the tag). */
  Cmd: [typeof EXEC_SHELL, "-c", string, string, string];
  Env: string[];
  User: string;
  WorkingDir: string;
  ConsoleSize: [number, number];
}

export interface ExecStartBody {
  Detach: false;
  Tty: true;
}

export interface KillExecCreateBody {
  AttachStdin: false;
  AttachStdout: false;
  AttachStderr: false;
  Tty: false;
  /** The kill script, then its $0 and $1 (the tag). */
  Cmd: [typeof EXEC_SHELL, "-c", string, typeof KILL_SCRIPT_NAME, string];
  User: string;
  WorkingDir: "/";
}

/** `Tty` must match the kill exec's create body. */
export interface DetachedExecStartBody {
  Detach: true;
  Tty: false;
}

/** `shell` is `TERMINAL_SHELL`, already checked as an absolute path by the config; `tag` names the pid file. */
export function execCreateBody(shell: string, tag: string): ExecCreateBody {
  return {
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true,
    Tty: true,
    // Positional arguments, so neither the shell path nor the tag ever becomes shell syntax.
    Cmd: [EXEC_SHELL, "-c", SHELL_WRAPPER, shell, tag],
    // Added to the container's own `HOME`; nothing from the service's environment reaches the shell.
    Env: ["TERM=xterm-256color", "LANG=C.UTF-8"],
    User: `${LEARNER_UID}:${LEARNER_GID}`,
    WorkingDir: WORK_DIR,
    ConsoleSize: [...EXEC_CONSOLE_SIZE],
  };
}

export function execStartBody(): ExecStartBody {
  return { Detach: false, Tty: true };
}

/**
 * The same user as the shell, so it can signal the shell's processes. No `Env`: the container's `HOME` and the image's
 * `PATH` are all the script needs. `WorkingDir /` because the learner may have deleted the shell's working directory,
 * and an exec whose cwd is missing does not start. The tag is not checked: the adapter that generated it is its only
 * producer.
 */
export function killExecCreateBody(tag: string): KillExecCreateBody {
  return {
    AttachStdin: false,
    AttachStdout: false,
    AttachStderr: false,
    Tty: false,
    Cmd: [EXEC_SHELL, "-c", KILL_SCRIPT, KILL_SCRIPT_NAME, tag],
    User: `${LEARNER_UID}:${LEARNER_GID}`,
    WorkingDir: "/",
  };
}

export function detachedExecStartBody(): DetachedExecStartBody {
  return { Detach: true, Tty: false };
}
