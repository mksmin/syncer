import { describe, expect, it } from "vitest";
import type { RemoteStorageProvider } from "../src/providers/remote-storage-provider";
import { NewFileExecutor, type NewFileVault } from "../src/sync/new-file-executor";
import type { RemoteFile } from "../src/types/remote";
import type { DownloadNewOperation } from "../src/types/sync";

class MemoryVault implements NewFileVault {
  readonly entries = new Map<
    string,
    { path: string; children?: unknown; stat?: { size: number; mtime: number } }
  >();
  readonly text = new Map<string, string>();
  readonly binary = new Map<string, ArrayBuffer>();
  folderCreateError: Error | undefined;

  getAbstractFileByPath(path: string) {
    return this.entries.get(path) ?? null;
  }

  async createFolder(path: string) {
    if (this.folderCreateError !== undefined) {
      const error = this.folderCreateError;
      this.folderCreateError = undefined;
      this.entries.set(path, { path, children: [] });
      throw error;
    }
    const entry = { path, children: [] };
    this.entries.set(path, entry);
    return entry;
  }

  async create(path: string, data: string) {
    this.text.set(path, data);
    const entry = { path, stat: { size: new TextEncoder().encode(data).byteLength, mtime: 10 } };
    this.entries.set(path, entry);
    return entry;
  }

  async createBinary(path: string, data: ArrayBuffer) {
    this.binary.set(path, data);
    const entry = { path, stat: { size: data.byteLength, mtime: 10 } };
    this.entries.set(path, entry);
    return entry;
  }
}

function remote(path: string, content: string, mimeType = "text/plain"): RemoteFile {
  return {
    path: `disk:/Vault/${path}`,
    relativePath: path,
    name: path.split("/").at(-1) ?? path,
    size: new TextEncoder().encode(content).byteLength,
    modifiedAt: 1,
    mimeType,
  };
}

function operation(file: RemoteFile): DownloadNewOperation {
  return { type: "DOWNLOAD_NEW", relativePath: file.relativePath, remoteFile: file };
}

function provider(content: string): RemoteStorageProvider {
  return {
    type: "yandex-disk",
    validateConnection: async () => ({ ok: true, message: "ok", checkedAt: 1 }),
    listFiles: async () => [],
    downloadFile: async () => new TextEncoder().encode(content).buffer,
  };
}

describe("NewFileExecutor", () => {
  it("creates folders and a new text file", async () => {
    const vault = new MemoryVault();
    const saved: string[] = [];
    const file = remote("Folder/A.md", "hello");
    const result = await new NewFileExecutor({
      vault,
      provider: provider("hello"),
      concurrency: 2,
      onCreated: async (created) => {
        saved.push(created.remoteFile.relativePath);
      },
    }).execute([operation(file)]);
    expect(result.status).toBe("completed");
    expect(vault.text.get("Folder/A.md")).toBe("hello");
    expect(vault.entries.has("Folder")).toBe(true);
    expect(saved).toEqual(["Folder/A.md"]);
  });

  it("never overwrites an existing path", async () => {
    const vault = new MemoryVault();
    vault.entries.set("A.md", { path: "A.md", stat: { size: 3, mtime: 1 } });
    const result = await new NewFileExecutor({
      vault,
      provider: provider("new"),
      concurrency: 1,
      onCreated: async () => undefined,
    }).execute([operation(remote("A.md", "new"))]);
    expect(result.status).toBe("completed-with-errors");
    expect(vault.text.has("A.md")).toBe(false);
  });

  it("does not write content that fails validation", async () => {
    const vault = new MemoryVault();
    const result = await new NewFileExecutor({
      vault,
      provider: provider("short"),
      concurrency: 1,
      onCreated: async () => undefined,
    }).execute([operation(remote("A.md", "longer"))]);
    expect(result.errors).toHaveLength(1);
    expect(vault.entries.has("A.md")).toBe(false);
  });

  it("accepts a folder created concurrently", async () => {
    const vault = new MemoryVault();
    vault.folderCreateError = new Error("Folder already exists.");
    const file = remote("Folder/A.md", "hello");
    const result = await new NewFileExecutor({
      vault,
      provider: provider("hello"),
      concurrency: 2,
      onCreated: async () => undefined,
    }).execute([operation(file)]);
    expect(result.status).toBe("completed");
    expect(vault.text.get("Folder/A.md")).toBe("hello");
  });
});
