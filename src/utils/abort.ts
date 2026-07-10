import { NetworkError, SyncCancelledError } from "../infrastructure/errors";

export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) throw new SyncCancelledError("Операция остановлена пользователем.");
}

export async function raceWithAbortAndTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<T> {
  throwIfAborted(signal);
  return await new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      activeWindow.clearTimeout(timeoutId);
      signal?.removeEventListener("abort", onAbort);
      callback();
    };
    const onAbort = (): void =>
      finish(() => reject(new SyncCancelledError("Операция остановлена пользователем.")));
    const timeoutId = activeWindow.setTimeout(
      () => finish(() => reject(new NetworkError("Превышено время ожидания сетевого запроса."))),
      timeoutMs,
    );
    signal?.addEventListener("abort", onAbort, { once: true });
    operation.then(
      (value) => finish(() => resolve(value)),
      (error: unknown) =>
        finish(() => reject(error instanceof Error ? error : new Error(String(error)))),
    );
  });
}

export async function cancellableDelay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  await new Promise<void>((resolve, reject) => {
    const onAbort = (): void => {
      activeWindow.clearTimeout(timeoutId);
      reject(new SyncCancelledError("Операция остановлена пользователем."));
    };
    const timeoutId = activeWindow.setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
