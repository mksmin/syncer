import { IntegrityError } from "../infrastructure/errors";

export function isTextFile(mimeType: string | undefined, path: string): boolean {
  if (mimeType?.startsWith("text/") === true) return true;
  if (mimeType === "application/json" || mimeType?.includes("xml") === true) return true;
  return /\.(?:md|txt|json|css|js|ts|html?|xml|csv|ya?ml|svg)$/iu.test(path);
}

export function decodeUtf8(content: ArrayBuffer, path: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(content);
  } catch {
    throw new IntegrityError(`Текстовый файл не является корректным UTF-8: ${path}`);
  }
}
