import { describe, expect, it } from "vitest";
import type { RemoteStorageProvider } from "../src/providers/remote-storage-provider";
import {
  UpdateFileExecutor,
  type UpdateFileVault,
  type UpdateVaultFile,
} from "../src/sync/update-file-executor";
import type { RemoteFile } from "../src/types/remote";
import type { UpdateLocalOperation } from "../src/types/sync";

class UpdateMemoryVault implements UpdateFileVault {
  readonly file: UpdateVaultFile = { path: "A.md", stat: { size: 3, mtime: 1 } };
  content = new TextEncoder().encode("old").buffer;
  failTextModify = false;

  getAbstractFileByPath(path: string): UpdateVaultFile | null {
    return path === this.file.path ? this.file : null;
  }

  async readBinary(): Promise<ArrayBuffer> {
    return this.content.slice(0);
  }

  async modify(_file: UpdateVaultFile, data: string): Promise<void> {
    this.content = new TextEncoder().encode(data).buffer;
    this.file.stat = { size: this.content.byteLength, mtime: 2 };
    if (this.failTextModify) {
      this.content = new TextEncoder().encode("broken").buffer;
      throw new Error("write failed");
    }
  }

  async modifyBinary(_file: UpdateVaultFile, data: ArrayBuffer): Promise<void> {
    this.content = data.slice(0);
    this.file.stat = { size: this.content.byteLength, mtime: 2 };
  }
}

const remote: RemoteFile = {
  path: "disk:/Vault/A.md",
  relativePath: "A.md",
  name: "A.md",
  size: 3,
  modifiedAt: 2,
  mimeType: "text/markdown",
};

function operation(): UpdateLocalOperation {
  return {
    type: "UPDATE_LOCAL",
    relativePath: "A.md",
    remoteFile: remote,
    localFile: { relativePath: "A.md", size: 3, modifiedAt: 1 },
  };
}

function provider(): RemoteStorageProvider {
  return {
    type: "yandex-disk",
    validateConnection: async () => ({ ok: true, message: "ok", checkedAt: 1 }),
    listFiles: async () => [],
    downloadFile: async () => new TextEncoder().encode("new").buffer,
  };
}

describe("UpdateFileExecutor", () => {
  it("updates a verified unchanged local file", async () => {
    const vault = new UpdateMemoryVault();
    const snapshots: string[] = [];
    const result = await new UpdateFileExecutor({
      vault,
      provider: provider(),
      concurrency: 1,
      onUpdated: async (entry) => {
        snapshots.push(entry.remoteFile.relativePath);
      },
    }).execute([operation()]);
    expect(result.status).toBe("completed");
    expect(new TextDecoder().decode(vault.content)).toBe("new");
    expect(snapshots).toEqual(["A.md"]);
  });

  it("refuses overwrite after local stat changed", async () => {
    const vault = new UpdateMemoryVault();
    vault.file.stat.mtime = 99;
    const result = await new UpdateFileExecutor({
      vault,
      provider: provider(),
      concurrency: 1,
      onUpdated: async () => undefined,
    }).execute([operation()]);
    expect(result.status).toBe("completed-with-errors");
    expect(new TextDecoder().decode(vault.content)).toBe("old");
  });

  it("restores old bytes when modify fails", async () => {
    const vault = new UpdateMemoryVault();
    vault.failTextModify = true;
    const result = await new UpdateFileExecutor({
      vault,
      provider: provider(),
      concurrency: 1,
      onUpdated: async () => undefined,
    }).execute([operation()]);
    expect(result.errors[0]?.message).toContain("Причина: write failed");
    expect(result.errors[0]?.message).toContain("Старая копия восстановлена");
    expect(new TextDecoder().decode(vault.content)).toBe("old");
  });
});
