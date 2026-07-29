import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { projectPath } from "./config.js";
import type { DetectionFile, DetectionGroup, PageRecord, PendingThread, Timeline } from "./types.js";

const timelineFile = projectPath("data", "timeline.json");
const recentPagesFile = projectPath("data", "recentPages.json");
const pendingThreadsFile = projectPath("data", "threads.json");
const detectionsDir = projectPath("data", "detections");

function readJson<T>(file: string): T | null {
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

function writeJson(file: string, value: unknown): void {
  mkdirSync(projectPath("data"), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function loadTimeline(): Timeline | null {
  const timeline = readJson<Timeline>(timelineFile);
  if (!timeline || typeof timeline.lastCheckedAt !== "number") return null;
  return timeline;
}

export function saveTimeline(lastCheckedAt: number): void {
  writeJson(timelineFile, { lastCheckedAt });
}

export function loadRecentPages(): PageRecord[] {
  return readJson<PageRecord[]>(recentPagesFile) ?? [];
}

export function saveRecentPages(records: PageRecord[]): void {
  writeJson(recentPagesFile, records);
}

export function loadPendingThreads(): PendingThread[] {
  const threads = readJson<PendingThread[]>(pendingThreadsFile) ?? [];
  return threads.map((thread) => ({
    ...thread,
    notifiedFailure: thread.notifiedFailure ?? false,
    totalPages: thread.totalPages ?? thread.pages.length,
  }));
}

export function savePendingThreads(threads: PendingThread[]): void {
  writeJson(pendingThreadsFile, threads);
}

export function saveDetection(detectedAt: number, groups: DetectionGroup[]): string {
  mkdirSync(detectionsDir, { recursive: true });
  const name = `${detectedAt}.json`;
  const payload: DetectionFile = { detectedAt, groups };
  writeFileSync(
    projectPath("data", "detections", name),
    `${JSON.stringify(payload, null, 2)}\n`,
    "utf8"
  );
  return name;
}
