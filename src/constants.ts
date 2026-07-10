export const PLUGIN_ID = "syncer";
export const YANDEX_CLIENT_ID = "a5c324e8667a46269a2d8dd70f4472bd";
export const CURRENT_DATA_SCHEMA_VERSION = 1;
export const DEFAULT_MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
export const CODEX_EXCLUDE_PATTERN = ".codex/**";

export const DEFAULT_EXCLUDE_PATTERNS = [
  [".obsidian", "**"].join("/"),
  ".trash/**",
  ".git/**",
  CODEX_EXCLUDE_PATTERN,
  ".DS_Store",
  "Thumbs.db",
  "*.tmp",
  "*.part",
] as const;
