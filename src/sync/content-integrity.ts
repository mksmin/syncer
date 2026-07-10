import SparkMD5 from "spark-md5";
import { IntegrityError } from "../infrastructure/errors";
import type { RemoteFile } from "../types/remote";

export async function verifyDownloadedContent(
  file: RemoteFile,
  content: ArrayBuffer,
): Promise<void> {
  if (content.byteLength !== file.size) {
    throw new IntegrityError(
      `Размер ${file.relativePath}: ожидалось ${String(file.size)}, получено ${String(content.byteLength)}.`,
    );
  }
  if (file.checksum === undefined || file.checksumAlgorithm === undefined) return;
  const actual =
    file.checksumAlgorithm === "md5" ? SparkMD5.ArrayBuffer.hash(content) : await sha256(content);
  if (actual.toLowerCase() !== file.checksum.toLowerCase()) {
    throw new IntegrityError(`Checksum не совпал: ${file.relativePath}.`);
  }
}

async function sha256(content: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", content);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
