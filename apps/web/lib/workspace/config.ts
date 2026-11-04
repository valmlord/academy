import "server-only";
import { readWorkspaceServiceConfig, type WorkspaceServiceConfig } from "./env";

// Read per call, not at module load: a server action module can be evaluated during `next build`, where the
// compose environment does not exist. The values were already checked at startup (lib/startup.ts).
export function workspaceServiceConfig(): WorkspaceServiceConfig {
  return readWorkspaceServiceConfig({
    WORKSPACE_SERVICE_URL: process.env.WORKSPACE_SERVICE_URL,
    WORKSPACE_SERVICE_SECRET: process.env.WORKSPACE_SERVICE_SECRET,
    TERMINAL_RECONNECT_ATTEMPTS: process.env.TERMINAL_RECONNECT_ATTEMPTS,
    TERMINAL_RELAY_MAX_SECONDS: process.env.TERMINAL_RELAY_MAX_SECONDS,
  });
}
