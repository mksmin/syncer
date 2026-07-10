import { describe, expect, it } from "vitest";
import {
  TrashFileExecutor,
  type LocalTrashManager,
  type TrashFileVault,
  type TrashVaultFile,
} from "../src/sync/trash-file-executor";
import type { TrashLocalOperation } from "../src/types/sync";

class MemoryVault implements TrashFileVault, LocalTrashManager {
  readonly files = new Map<string, TrashVaultFile>();
  failPath: string | undefined;

  getAbstractFileByPath(path: string): TrashVaultFile | null {
    return this.files.get(path) ?? null;
  }

  async trashFile(file: TrashVaultFile): Promise<void> {
    if (file.path === this.failPath) throw new Error("trash failed");
    this.files.delete(file.path);
  }
}

function operation(path: string, mtime = 1): TrashLocalOperation {
  return {
    type: "TRASH_LOCAL",
    relativePath: path,
    localFile: { relativePath: path, size: 3, modifiedAt: mtime },
  };
}

describe("TrashFileExecutor", () => {
  it("moves an unchanged file to trash and updates snapshot", async () => {
    const vault = new MemoryVault();
    vault.files.set("Old.md", { path: "Old.md", stat: { size: 3, mtime: 1 } });
    const snapshots: string[] = [];
    const result = await new TrashFileExecutor({
      vault,
      fileManager: vault,
      onTrashed: async (path) => {
        snapshots.push(path);
      },
    }).execute([operation("Old.md")]);
    expect(result.status).toBe("completed");
    expect(result.trashed).toEqual(["Old.md"]);
    expect(snapshots).toEqual(["Old.md"]);
    expect(vault.files.has("Old.md")).toBe(false);
  });

  it("refuses trash after local file changed", async () => {
    const vault = new MemoryVault();
    vault.files.set("Old.md", { path: "Old.md", stat: { size: 3, mtime: 2 } });
    const result = await new TrashFileExecutor({
      vault,
      fileManager: vault,
      onTrashed: async () => undefined,
    }).execute([operation("Old.md")]);
    expect(result.status).toBe("completed-with-errors");
    expect(result.errors[0]?.message).toContain("изменился после подготовки плана");
    expect(vault.files.has("Old.md")).toBe(true);
  });

  it("continues after a per-file trash error", async () => {
    const vault = new MemoryVault();
    vault.files.set("A.md", { path: "A.md", stat: { size: 3, mtime: 1 } });
    vault.files.set("B.md", { path: "B.md", stat: { size: 3, mtime: 1 } });
    vault.failPath = "A.md";
    const result = await new TrashFileExecutor({
      vault,
      fileManager: vault,
      onTrashed: async () => undefined,
    }).execute([operation("A.md"), operation("B.md")]);
    expect(result.status).toBe("completed-with-errors");
    expect(result.trashed).toEqual(["B.md"]);
    expect(vault.files.has("A.md")).toBe(true);
  });

  it("does not trash anything after cancellation", async () => {
    const vault = new MemoryVault();
    vault.files.set("A.md", { path: "A.md", stat: { size: 3, mtime: 1 } });
    const controller = new AbortController();
    controller.abort();
    const result = await new TrashFileExecutor({
      vault,
      fileManager: vault,
      onTrashed: async () => undefined,
    }).execute([operation("A.md")], controller.signal);
    expect(result.status).toBe("cancelled");
    expect(result.trashed).toHaveLength(0);
    expect(vault.files.has("A.md")).toBe(true);
  });
});
