/**
 * One promise chain per key (design 6.3): a task starts only after every earlier task on its key has
 * settled, tasks on different keys run concurrently, and a rejected task never blocks the next one. A key's
 * entry is deleted when its chain drains, so the map holds only keys with work in flight.
 */
export class KeyedMutex {
  readonly #tails = new Map<string, Promise<void>>();

  /** Keys with a task queued or running. Read-only; exposed so a test can see the map shrink. */
  get size(): number {
    return this.#tails.size;
  }

  run<T>(key: string, task: () => Promise<T> | T): Promise<T> {
    const previous = this.#tails.get(key) ?? Promise.resolve();
    // A synchronous throw inside the callback becomes a rejection of `result`, like an async one.
    const result = previous.then(() => task());
    const release = (): void => {
      if (this.#tails.get(key) === tail) this.#tails.delete(key);
    };
    // Both branches release: the chain continues after a rejection, which stays the caller's to handle.
    const tail: Promise<void> = result.then(release, release);
    this.#tails.set(key, tail);
    return result;
  }
}
