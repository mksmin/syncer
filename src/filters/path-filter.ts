import { normalizeRelativePath } from "../utils/paths";

export interface PathFilter {
  isIncluded(relativePath: string): boolean;
}

export interface GlobValidationResult {
  valid: boolean;
  error?: string;
}

export class GlobPathFilter implements PathFilter {
  private readonly matchers: RegExp[];

  constructor(patterns: readonly string[]) {
    this.matchers = patterns.filter((pattern) => pattern.trim() !== "").map(compileGlob);
  }

  isIncluded(relativePath: string): boolean {
    const normalized = normalizeRelativePath(relativePath);
    return !this.matchers.some((matcher) => matcher.test(normalized));
  }
}

export function validateGlob(pattern: string): GlobValidationResult {
  try {
    compileGlob(pattern);
    return { valid: true };
  } catch (error: unknown) {
    return { valid: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function compileGlob(rawPattern: string): RegExp {
  const pattern = rawPattern.trim().replaceAll("\\", "/");
  if (pattern === "") throw new Error("Glob pattern is empty.");
  if (pattern.includes("..")) throw new Error("Glob must not contain '..'.");

  let expression = "";
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === "*") {
      if (pattern[index + 1] === "*") {
        while (pattern[index + 1] === "*") index += 1;
        if (pattern[index + 1] === "/") {
          index += 1;
          expression += "(?:.*/)?";
        } else {
          expression += ".*";
        }
      } else {
        expression += "[^/]*";
      }
    } else if (character === "?") {
      expression += "[^/]";
    } else if (character === "[") {
      const close = pattern.indexOf("]", index + 1);
      if (close < 0) throw new Error(`Unclosed character class in glob: ${rawPattern}`);
      const body = pattern.slice(index + 1, close);
      if (body === "") throw new Error(`Empty character class in glob: ${rawPattern}`);
      expression += `[${body.replaceAll("\\", "\\\\")}]`;
      index = close;
    } else {
      expression += escapeRegex(character ?? "");
    }
  }
  return new RegExp(`^${expression}$`, "u");
}

function escapeRegex(value: string): string {
  return value.replace(/[\\^$.*+?()[\]{}|]/gu, "\\$&");
}
