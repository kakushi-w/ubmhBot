import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { BotConfig } from "./types.js";

const rootDir = resolve(import.meta.dirname, "..");

export function projectPath(...parts: string[]): string {
  return resolve(rootDir, ...parts);
}

let cachedConfig: BotConfig | null = null;

export function loadConfig(): BotConfig {
  if (cachedConfig) return cachedConfig;
  const raw = readFileSync(projectPath("config.json"), "utf8");
  cachedConfig = JSON.parse(raw) as BotConfig;
  return cachedConfig;
}

export function loadAdmins(): string[] {
  const raw = readFileSync(projectPath("admin.json"), "utf8");
  return JSON.parse(raw) as string[];
}

export function siteUrl(): string {
  return `https://${loadConfig().wiki}.wikidot.com`;
}
