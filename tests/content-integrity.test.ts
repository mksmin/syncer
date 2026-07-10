import { describe, expect, it } from "vitest";
import { verifyDownloadedContent } from "../src/sync/content-integrity";
import type { RemoteFile } from "../src/types/remote";

const bytes = new TextEncoder().encode("hello").buffer;
const file: RemoteFile = {
  path: "disk:/hello.txt",
  relativePath: "hello.txt",
  name: "hello.txt",
  size: 5,
  modifiedAt: 1,
  checksum: "5d41402abc4b2a76b9719d911017c592",
  checksumAlgorithm: "md5",
};

describe("download integrity", () => {
  it("accepts matching size and MD5", async () => {
    await expect(verifyDownloadedContent(file, bytes)).resolves.toBeUndefined();
  });

  it("rejects size or checksum mismatch", async () => {
    await expect(verifyDownloadedContent({ ...file, size: 6 }, bytes)).rejects.toThrow("Размер");
    await expect(verifyDownloadedContent({ ...file, checksum: "bad" }, bytes)).rejects.toThrow(
      "Checksum",
    );
  });
});
