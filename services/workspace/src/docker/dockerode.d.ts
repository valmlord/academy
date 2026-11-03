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

  class Docker {
    constructor(options?: DockerOptions);
    ping(): Promise<unknown>;
    version(): Promise<unknown>;
  }

  export = Docker;
}
