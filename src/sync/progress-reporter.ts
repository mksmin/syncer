import type { ProgressSink, SyncProgress } from "../types/sync";

export type ProgressListener = (progress: SyncProgress) => void;

export class SyncProgressReporter implements ProgressSink {
  private readonly listeners = new Set<ProgressListener>();
  private current: SyncProgress = {
    stage: "idle",
    current: 0,
    total: 0,
    message: "Ожидание",
  };

  report(progress: SyncProgress): void {
    this.current = progress;
    for (const listener of this.listeners) listener(progress);
  }

  getProgress(): SyncProgress {
    return this.current;
  }

  subscribe(listener: ProgressListener): () => void {
    this.listeners.add(listener);
    listener(this.current);
    return () => this.listeners.delete(listener);
  }
}
