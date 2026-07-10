export function normalizePath(path: string): string {
  const normalized = path.replaceAll("\\", "/").replace(/\/{2,}/gu, "/");
  return normalized === "" ? "/" : normalized;
}
