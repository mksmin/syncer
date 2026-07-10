import type { DownloadNewOperation, SyncPlan, UpdateLocalOperation } from "../types/sync";

export type PullSelection = "all" | "new" | "updates";

export interface SelectedPullOperations {
  downloads: DownloadNewOperation[];
  updates: UpdateLocalOperation[];
}

export function selectPullOperations(
  plan: SyncPlan,
  selection: PullSelection,
): SelectedPullOperations {
  return {
    downloads:
      selection === "updates"
        ? []
        : plan.operations.filter(
            (operation): operation is DownloadNewOperation => operation.type === "DOWNLOAD_NEW",
          ),
    updates:
      selection === "new"
        ? []
        : plan.operations.filter(
            (operation): operation is UpdateLocalOperation => operation.type === "UPDATE_LOCAL",
          ),
  };
}
