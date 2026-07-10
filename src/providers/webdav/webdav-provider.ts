import { UnsupportedProviderError } from "../../infrastructure/errors";
import type { ConnectionCheckResult, RemoteFile } from "../../types/remote";
import type { RemoteStorageProvider } from "../remote-storage-provider";
import type { WebDavProviderSettings } from "./webdav-settings";

/** Deliberately unavailable in v0.1.0; this contract is exercised by factory tests. */
export class WebDavProvider implements RemoteStorageProvider {
  readonly type = "webdav" as const;

  constructor(readonly settings: WebDavProviderSettings) {}

  validateConnection(_signal?: AbortSignal): Promise<ConnectionCheckResult> {
    return Promise.reject(this.notImplemented());
  }

  listFiles(_rootPath: string, _signal?: AbortSignal): Promise<RemoteFile[]> {
    return Promise.reject(this.notImplemented());
  }

  downloadFile(_remotePath: string, _signal?: AbortSignal): Promise<ArrayBuffer> {
    return Promise.reject(this.notImplemented());
  }

  private notImplemented(): UnsupportedProviderError {
    return new UnsupportedProviderError("WebDAV is planned for v1.2.0 and is disabled.");
  }
}
