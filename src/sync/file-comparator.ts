import type { RemoteFile } from "../types/remote";
import type { LocalFile } from "../types/sync";
import type { SyncedFileState } from "../types/state";

export type FileComparison = "same" | "different";

/**
 * Avoids local hashing when the local stat and authoritative remote identity still match the
 * successful snapshot. Ambiguous files are intentionally treated as different.
 */
export function compareFile(
  remote: RemoteFile,
  local: LocalFile,
  previous: SyncedFileState | undefined,
): FileComparison {
  if (remote.size !== local.size) return "different";

  if (
    remote.checksum !== undefined &&
    local.checksum !== undefined &&
    remote.checksumAlgorithm === local.checksumAlgorithm
  ) {
    return remote.checksum === local.checksum ? "same" : "different";
  }

  if (previous === undefined) return "different";

  const localIsUntouched =
    previous.localSize === local.size && previous.localModifiedAt === local.modifiedAt;
  if (!localIsUntouched) return "different";

  const sameRemoteChecksum =
    remote.checksum !== undefined && previous.remoteChecksum === remote.checksum;
  const sameRemoteRevision =
    remote.revision !== undefined && previous.remoteRevision === remote.revision;
  const sameRemoteFallback =
    remote.checksum === undefined &&
    remote.revision === undefined &&
    previous.remoteSize === remote.size &&
    previous.remoteModifiedAt === remote.modifiedAt;

  return sameRemoteChecksum || sameRemoteRevision || sameRemoteFallback ? "same" : "different";
}
