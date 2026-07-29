type LogLevel = "info" | "warn" | "error";

function replacer(_key: string, value: unknown): unknown {
  if (value instanceof Error) return { name: value.name, message: value.message };
  return value;
}

function emit(level: LogLevel, first: unknown, second?: string): void {
  const message = typeof first === "string" ? first : second ?? "";
  const context = typeof first === "string" ? {} : (first as Record<string, unknown>);
  const line = { level, time: new Date().toISOString(), message, ...context };
  const text = JSON.stringify(line, replacer);
  if (level === "info") console.log(text);
  else console.error(text);
}

export const log = {
  info(first: unknown, second?: string): void {
    emit("info", first, second);
  },
  warn(first: unknown, second?: string): void {
    emit("warn", first, second);
  },
  error(first: unknown, second?: string): void {
    emit("error", first, second);
  },
};
