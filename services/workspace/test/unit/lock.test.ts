import { describe, expect, it } from "vitest";
import { KeyedMutex } from "../../src/lock.js";

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}

function deferred<T = void>(): Deferred<T> {
  let resolve: (value: T) => void = () => {};
  let reject: (error: unknown) => void = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Lets every queued promise callback run, so "has not started" is a real observation. */
async function settle(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

describe("KeyedMutex", () => {
  it("1: runs the second task on a key only after the first settles", async () => {
    const mutex = new KeyedMutex();
    const order: string[] = [];
    const first = deferred();
    const second = deferred();

    const runs = [
      mutex.run("k", async () => {
        order.push("start1");
        await first.promise;
        order.push("end1");
      }),
      mutex.run("k", async () => {
        order.push("start2");
        await second.promise;
        order.push("end2");
      }),
    ];
    await settle();
    expect(order).toEqual(["start1"]);
    first.resolve();
    await settle();
    second.resolve();
    await Promise.all(runs);

    expect(order).toEqual(["start1", "end1", "start2", "end2"]);
  });

  it("2: runs three tasks on one key in submission order", async () => {
    const mutex = new KeyedMutex();
    const started: number[] = [];
    const gates = [deferred(), deferred(), deferred()];

    const runs = gates.map((gate, index) =>
      mutex.run("k", async () => {
        started.push(index);
        await gate.promise;
      }),
    );
    for (const gate of gates) {
      await settle();
      gate.resolve();
    }
    await Promise.all(runs);

    expect(started).toEqual([0, 1, 2]);
  });

  it("3: starts tasks on two different keys before either settles", async () => {
    const mutex = new KeyedMutex();
    const started: string[] = [];
    const gate = deferred();

    const runs = ["a", "b"].map((key) =>
      mutex.run(key, async () => {
        started.push(key);
        await gate.promise;
      }),
    );
    await settle();

    expect(started).toEqual(["a", "b"]);
    gate.resolve();
    await Promise.all(runs);
  });

  it("4: rejects a failing task's own run and still runs the next task on the key", async () => {
    const mutex = new KeyedMutex();
    const failure = new Error("task failed");
    const gate = deferred();

    const failing = mutex.run("k", async () => {
      await gate.promise;
      throw failure;
    });
    const next = mutex.run("k", () => "next done");
    gate.resolve();

    await expect(failing).rejects.toBe(failure);
    await expect(next).resolves.toBe("next done");
  });

  it("5: treats a synchronous throw like a rejection", async () => {
    const mutex = new KeyedMutex();
    const failure = new Error("thrown synchronously");

    const failing = mutex.run("k", () => {
      throw failure;
    });
    const next = mutex.run("k", () => "next done");

    await expect(failing).rejects.toBe(failure);
    await expect(next).resolves.toBe("next done");
  });

  it("6: deletes the key's entry once its chain drains, after a success and after a rejection", async () => {
    const mutex = new KeyedMutex();

    const success = mutex.run("ok", () => 1);
    const failure = mutex.run("bad", () => Promise.reject(new Error("no")));
    expect(mutex.size).toBe(2);
    await success;
    await failure.catch(() => undefined);
    await settle();

    expect(mutex.size).toBe(0);
  });

  it("7: returns the task's own value", async () => {
    const mutex = new KeyedMutex();
    const value = { id: "w1" };

    await expect(mutex.run("k", async () => value)).resolves.toBe(value);
  });
});
