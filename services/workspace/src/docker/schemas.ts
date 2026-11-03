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

/** Docker sends `null` for an object created without labels; the service treats that as no labels. */
const labelsSchema = z
  .record(z.string(), z.string())
  .nullable()
  .transform((labels) => labels ?? {});

/**
 * `State.StartedAt` of a container that has never been started: Go's zero time. The ensure algorithm
 * consults the starter marker only for such a container (design 6.1).
 */
export const NEVER_STARTED_AT = "0001-01-01T00:00:00Z";

export const containerInspectSchema = z.object({
  Id: z.string().min(1),
  Name: z.string(),
  State: z.object({
    Status: z.string(),
    Running: z.boolean(),
    StartedAt: z.string(),
    ExitCode: z.number().int(),
    OOMKilled: z.boolean(),
  }),
  Config: z.object({ Image: z.string(), Labels: labelsSchema }),
});
export type ContainerInspect = z.infer<typeof containerInspectSchema>;

export const volumeInspectSchema = z.object({
  Name: z.string().min(1),
  Labels: labelsSchema,
  CreatedAt: z.string(),
});
export type VolumeInspect = z.infer<typeof volumeInspectSchema>;

export const imageInspectSchema = z.object({ Id: z.string().min(1) });
export type ImageInspect = z.infer<typeof imageInspectSchema>;

export const containerListSchema = z.array(
  z.object({
    Id: z.string().min(1),
    Names: z.array(z.string()),
    State: z.string(),
    Labels: labelsSchema,
  }),
);
export type ContainerSummary = z.infer<typeof containerListSchema>[number];

/** The volume list wraps its items; Docker sends `null` instead of an empty array when nothing matches. */
export const volumeListSchema = z.object({
  Volumes: z
    .array(volumeInspectSchema)
    .nullable()
    .transform((volumes) => volumes ?? []),
});

export const networkListSchema = z.array(
  z.object({ Id: z.string().min(1), Name: z.string().min(1), Labels: labelsSchema }),
);
export type NetworkSummary = z.infer<typeof networkListSchema>[number];

/** dockerode resolves a volume create with a handle on the volume, named as Docker answered. */
export const volumeHandleSchema = z.object({ name: z.string().min(1) });
/** dockerode resolves a network or container create with a handle on the new object's Id. */
export const idHandleSchema = z.object({ id: z.string().min(1) });
