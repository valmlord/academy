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
      Tmpfs: { "/tmp": TMP_MOUNT_OPTIONS },
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

/** The size Docker gives the TTY until the browser's first `resize` corrects it (rows, columns). */
const EXEC_CONSOLE_SIZE: [number, number] = [24, 80];

export interface ExecCreateBody {
  AttachStdin: true;
  AttachStdout: true;
  AttachStderr: true;
  Tty: true;
  Cmd: [string, "-l"];
  Env: string[];
  User: string;
  WorkingDir: string;
  ConsoleSize: [number, number];
}

export interface ExecStartBody {
  Detach: false;
  Tty: true;
}

/** `shell` is `TERMINAL_SHELL`, already checked as an absolute path by the config. */
export function execCreateBody(shell: string): ExecCreateBody {
  return {
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true,
    Tty: true,
    Cmd: [shell, "-l"],
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
