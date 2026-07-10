import { throwIfAborted } from "../utils/abort";

export async function runBounded<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
  signal?: AbortSignal,
): Promise<void> {
  const workerCount = Math.min(items.length, Math.max(1, Math.floor(concurrency)));
  let nextIndex = 0;
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        throwIfAborted(signal);
        const index = nextIndex;
        nextIndex += 1;
        const item = items[index];
        if (item !== undefined) await worker(item);
      }
    }),
  );
}
