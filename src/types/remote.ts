export type RemoteProviderType = "yandex-disk" | "webdav";

export interface RemoteFile {
  path: string;
  relativePath: string;
  name: string;
  size: number;
  modifiedAt: number;
  revision?: string;
  checksum?: string;
  checksumAlgorithm?: "md5" | "sha256";
  mimeType?: string;
}

export interface ConnectionCheckResult {
  ok: boolean;
  message: string;
  checkedAt: number;
}

/** A list may only be used for deletion planning when complete is true. */
export interface RemoteFileIndex {
  files: RemoteFile[];
  complete: boolean;
  rootExists: boolean;
  fetchedAt: number;
}
