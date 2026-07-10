import { UnsupportedProviderError } from "../infrastructure/errors";
import type { RemoteProviderType } from "../types/remote";
import type { RemoteStorageProvider } from "./remote-storage-provider";

export type ProviderBuilder = () => RemoteStorageProvider;

/** Registry-based factory: adding WebDAV does not require a sync-engine change. */
export class ProviderFactory {
  private readonly builders = new Map<RemoteProviderType, ProviderBuilder>();

  register(type: RemoteProviderType, builder: ProviderBuilder): void {
    this.builders.set(type, builder);
  }

  create(type: RemoteProviderType): RemoteStorageProvider {
    const builder = this.builders.get(type);
    if (builder === undefined) {
      throw new UnsupportedProviderError(`Provider is not available yet: ${type}`);
    }
    return builder();
  }
}
