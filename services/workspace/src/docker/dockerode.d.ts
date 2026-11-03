// Local declaration of the few dockerode members the engine uses: `@types/dockerode` is full of `any` and is
// not resolvable from this package (design 4.9). Every result is `unknown` and is validated with zod in
// `engine.ts`. This file must stay a script (no top-level import or export): in a module file the
// `declare module` below would become an augmentation of a module that has no types, not a declaration.
declare module "dockerode" {
  interface DockerOptions {
    socketPath?: string;
    /** The API version prefix of every request path, e.g. `v1.44`. */
    version?: string;
    /** docker-modem's socket inactivity timeout in milliseconds. */
    timeout?: number;
  }

  /** `filters` is sent as JSON in the query string, e.g. `{ label: ["k=v"] }`; label filters are ANDed. */
  interface ListOptions {
    all?: boolean;
    filters?: { label: string[] };
  }

  /** A handle on one object by Id or name; nothing is requested until a method is called. */
  interface Inspectable {
    inspect(): Promise<unknown>;
  }

  class Docker {
    constructor(options?: DockerOptions);
    ping(): Promise<unknown>;
    version(): Promise<unknown>;
    getContainer(id: string): Inspectable;
    getVolume(name: string): Inspectable;
    getImage(name: string): Inspectable;
    listContainers(options: ListOptions): Promise<unknown>;
    listVolumes(options: ListOptions): Promise<unknown>;
    listNetworks(options: ListOptions): Promise<unknown>;
  }

  export = Docker;
}
