export type LogLevel = "error" | "warn" | "info" | "debug";

export interface Logger {
  error(message: string, context?: Readonly<Record<string, unknown>>): void;
  warn(message: string, context?: Readonly<Record<string, unknown>>): void;
  info(message: string, context?: Readonly<Record<string, unknown>>): void;
  debug(message: string, context?: Readonly<Record<string, unknown>>): void;
}

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const SENSITIVE_KEY = /authorization|password|secret|token/iu;

export function redactContext(
  context: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  return Object.fromEntries(
    Object.entries(context).map(([key, value]) => [
      key,
      SENSITIVE_KEY.test(key) ? "<redacted>" : value,
    ]),
  );
}

export class ConsoleLogger implements Logger {
  constructor(private readonly level: LogLevel) {}

  error(message: string, context: Readonly<Record<string, unknown>> = {}): void {
    this.write("error", message, context);
  }

  warn(message: string, context: Readonly<Record<string, unknown>> = {}): void {
    this.write("warn", message, context);
  }

  info(message: string, context: Readonly<Record<string, unknown>> = {}): void {
    this.write("info", message, context);
  }

  debug(message: string, context: Readonly<Record<string, unknown>> = {}): void {
    this.write("debug", message, context);
  }

  private write(
    level: LogLevel,
    message: string,
    context: Readonly<Record<string, unknown>>,
  ): void {
    if (LEVEL_WEIGHT[level] > LEVEL_WEIGHT[this.level]) return;
    const args: [string, Readonly<Record<string, unknown>>] = [
      `[Syncer] ${message}`,
      redactContext(context),
    ];
    if (level === "error") console.error(...args);
    else if (level === "warn") console.warn(...args);
    else if (level === "info") console.debug(...args);
    else console.debug(...args);
  }
}
