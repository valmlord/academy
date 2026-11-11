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

  interface Removable {
    remove(): Promise<unknown>;
  }

  /**
   * docker-modem sends `_query` as the query string and `_body` as the JSON body. Without the split it sends
   * the whole object as both, which would copy a create body (labels, later a container's environment) into
   * the request URL.
   */
  interface SplitRequest<Query, Body> {
    _query: Query;
    _body: Body;
  }

  interface ObjectCreateBody {
    Name: string;
    Labels: Record<string, string>;
  }

  interface ContainerHandle extends Inspectable {
    start(): Promise<unknown>;
    /** `t`: seconds between SIGTERM and SIGKILL. */
    stop(options: { t: number }): Promise<unknown>;
    /** `force` kills a running container first; `v` is never passed, so a remove never takes a volume. */
    remove(options: { force: boolean }): Promise<unknown>;
    /** `PUT /archive`: extracts the tar at `path`; a Buffer body is sent with its length. */
    putArchive(file: Buffer, options: { path: string }): Promise<unknown>;
    /** `HEAD /archive`: resolves with the open response stream, which the caller must destroy. */
    infoArchive(options: { path: string }): Promise<unknown>;
    /**
     * `POST /exec`: the create body goes as JSON (docker-modem sends `_body` when present, `modem.js:208`; the
     * path has no `?`, so no query is built). Resolves with a handle whose `id` is the exec's Id.
     */
    exec(options: SplitRequest<Record<string, never>, object>): Promise<unknown>;
  }

  /** A handle on one exec by Id; nothing is requested until a method is called. */
  interface ExecHandle {
    /**
     * `POST /exec/<id>/start` with `Connection: Upgrade`: resolves with the hijacked socket once the daemon
     * answers 101. `_body` is the JSON body; `stdin` keeps the request open for input.
     */
    start(options: {
      _body: { Detach: false; Tty: true };
      hijack: true;
      stdin: true;
    }): Promise<unknown>;
    /**
     * `POST /exec/<id>/start` detached, without an upgrade. `isStream` is always set: resolves with the response
     * stream, which the caller must destroy.
     */
    start(options: { _body: { Detach: true; Tty: false } }): Promise<unknown>;
    /** `h` and `w` go in the query string. */
    resize(options: { h: number; w: number }): Promise<unknown>;
    inspect(): Promise<unknown>;
  }

  class Docker {
    constructor(options?: DockerOptions);
    ping(): Promise<unknown>;
    version(): Promise<unknown>;
    getContainer(id: string): ContainerHandle;
    getExec(id: string): ExecHandle;
    getVolume(name: string): Inspectable & Removable;
    getNetwork(id: string): Removable;
    getImage(name: string): Inspectable;
    listContainers(options: ListOptions): Promise<unknown>;
    listVolumes(options: ListOptions): Promise<unknown>;
    listNetworks(options: ListOptions): Promise<unknown>;
    /** Resolves with a handle whose `name` is the volume's name. */
    createVolume(options: SplitRequest<Record<string, never>, ObjectCreateBody>): Promise<unknown>;
    /** Resolves with a handle whose `id` is the network's Id. */
    createNetwork(options: SplitRequest<Record<string, never>, ObjectCreateBody>): Promise<unknown>;
    /** The name goes in the query, the create body (the engine's own type) as JSON; resolves with a handle on the Id. */
    createContainer(options: SplitRequest<{ name: string }, object>): Promise<unknown>;
  }

  export = Docker;
}
