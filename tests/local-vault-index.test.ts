import { describe, expect, it } from "vitest";
import { IntegrityError } from "../src/infrastructure/errors";
import { LocalVaultIndex } from "../src/sync/local-vault-index";

describe("LocalVaultIndex", () => {
  it("normalizes and sorts vault metadata", () => {
    const index = new LocalVaultIndex({
      getFiles: () => [
        { path: "B.md", stat: { size: 2, mtime: 20 } },
        { path: "/Папка//A.md", stat: { size: 1, mtime: 10 } },
      ],
    });
    expect(index.listFiles()).toEqual([
      { relativePath: "B.md", size: 2, modifiedAt: 20 },
      { relativePath: "Папка/A.md", size: 1, modifiedAt: 10 },
    ]);
  });

  it("rejects duplicate normalized paths", () => {
    const index = new LocalVaultIndex({
      getFiles: () => [
        { path: "Folder/A.md", stat: { size: 1, mtime: 1 } },
        { path: "/Folder//A.md", stat: { size: 1, mtime: 1 } },
      ],
    });
    expect(() => index.listFiles()).toThrow(IntegrityError);
  });

  it("rejects corrupt metadata", () => {
    const index = new LocalVaultIndex({
      getFiles: () => [{ path: "A.md", stat: { size: -1, mtime: 1 } }],
    });
    expect(() => index.listFiles()).toThrow("Некорректные метаданные");
  });
});
