import { z } from "zod";

// The shapes the service reads from Docker Engine responses. Only the fields it uses are declared; zod strips
// the rest, so nothing else Docker sends (a container's environment, for one) is kept in memory or logged.

export const engineVersionSchema = z.object({
  ApiVersion: z.string().regex(/^\d+\.\d+$/),
  Version: z.string(),
});
export type EngineVersion = z.infer<typeof engineVersionSchema>;

/** Node's errno shape, e.g. `ENOENT` when the socket is missing or `ECONNRESET` after a timeout. */
export const errnoErrorSchema = z.object({ code: z.string() });
/** docker-modem's shape for an HTTP error status; its `json` and `reason` are deliberately not read. */
export const statusErrorSchema = z.object({ statusCode: z.number().int() });
