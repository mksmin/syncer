import { normalizePath as normalizeObsidianPath } from "obsidian";

export class UnsafePathError extends Error {
  override readonly name = "UnsafePathError";
}

export function normalizeRelativePath(input: string): string {
  const slashNormalized = input.trim().replaceAll("\\", "/");
  if (containsControlCharacter(slashNormalized)) {
    throw new UnsafePathError("Path contains a control character.");
  }

  const segments = slashNormalized.split("/").filter((segment) => segment.length > 0);
  if (segments.some((segment) => segment === "." || segment === "..")) {
    throw new UnsafePathError(`Path escapes the vault: ${input}`);
  }

  const normalized = normalizeObsidianPath(segments.join("/"));
  if (normalized === "." || normalized.startsWith("../") || normalized.includes("/../")) {
    throw new UnsafePathError(`Path escapes the vault: ${input}`);
  }
  return normalized === "/" ? "" : normalized.replace(/^\/+|\/+$/gu, "");
}

function containsControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0);
    if (code !== undefined && (code < 32 || code === 127)) return true;
  }
  return false;
}

export function getPathName(relativePath: string): string {
  const normalized = normalizeRelativePath(relativePath);
  const segments = normalized.split("/");
  return segments.at(-1) ?? "";
}
