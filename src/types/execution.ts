import type { RemoteFile } from "./remote";

export interface CreatedFileResult {
  remoteFile: RemoteFile;
  localSize: number;
  localModifiedAt: number;
}

export interface FileExecutionError {
  relativePath: string;
  message: string;
}

export interface NewFileExecutionResult {
  status: "completed" | "completed-with-errors" | "cancelled";
  plannedCount: number;
  created: CreatedFileResult[];
  errors: FileExecutionError[];
}
