import type { PageRecord } from "./types.js";

export function mergeRecords(previous: PageRecord[], fresh: PageRecord[]): PageRecord[] {
  const merged = new Map<string, PageRecord>();
  for (const record of [...previous, ...fresh]) {
    merged.set(record.pageId, record);
  }
  return [...merged.values()];
}

export function pruneRecords(
  records: PageRecord[],
  now: number,
  windowSeconds: number,
  excludedPageIds: Set<string>
): PageRecord[] {
  const floor = now - windowSeconds;
  return records.filter(
    (record) => record.createdAt >= floor && !excludedPageIds.has(record.pageId)
  );
}

export function detectBurstGroups(
  records: PageRecord[],
  windowSeconds: number,
  pageThreshold: number
): PageRecord[][] {
  const byAuthor = new Map<string, PageRecord[]>();
  for (const record of records) {
    const list = byAuthor.get(record.author);
    if (list) list.push(record);
    else byAuthor.set(record.author, [record]);
  }

  const groups: PageRecord[][] = [];

  for (const list of byAuthor.values()) {
    list.sort((left, right) => left.createdAt - right.createdAt);

    const flagged = new Set<number>();
    let start = 0;

    for (let end = 0; end < list.length; end++) {
      while ((list[end]?.createdAt ?? 0) - (list[start]?.createdAt ?? 0) > windowSeconds) {
        start++;
      }
      if (end - start + 1 >= pageThreshold) {
        for (let index = start; index <= end; index++) flagged.add(index);
      }
    }

    if (flagged.size > 0) {
      groups.push(
        [...flagged]
          .sort((left, right) => left - right)
          .map((index) => list[index] as PageRecord)
      );
    }
  }

  return groups;
}
