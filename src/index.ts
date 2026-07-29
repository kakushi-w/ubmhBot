import { login } from "./auth.js";
import { loadAdmins, loadConfig } from "./config.js";
import { detectBurstGroups, mergeRecords, pruneRecords } from "./detect.js";
import { fetchRssItems, fetchThreadPosts, savePost } from "./forum.js";
import { log } from "./log.js";
import {
  buildDetectionSource,
  buildResultSource,
  detectionTitle,
  parseInstruction,
  replyTitle,
} from "./message.js";
import { deletePage, renamePage } from "./pageAction.js";
import { fetchSitemap } from "./sitemap.js";
import {
  loadPendingThreads,
  loadRecentPages,
  loadTimeline,
  saveDetection,
  savePendingThreads,
  saveRecentPages,
  saveTimeline,
} from "./state.js";
import { nowSeconds, sleep } from "./util.js";
import { queryPageAuthor } from "./pageInfo.js";
import type {
  DetectionGroup,
  ForumPost,
  HandledPage,
  Instruction,
  PageRecord,
  PendingThread,
  Session,
} from "./types.js";

const maxCandidates = 300;
const queryDelay = 300;
const deletedPrefix = "deleted:";

async function collectNewPages(session: Session, since: number): Promise<PageRecord[]> {
  const entries = await fetchSitemap(session);
  const candidates = entries
    .filter((entry) => entry.lastmod === null || entry.lastmod > since)
    .sort((left, right) => (right.lastmod ?? 0) - (left.lastmod ?? 0));

  if (candidates.length > maxCandidates) {
    log.warn(
      { total: candidates.length, kept: maxCandidates },
      "candidate list truncated, older candidates skipped"
    );
  }

  const scanned = candidates.slice(0, maxCandidates);
  log.info({ count: scanned.length }, "scanning candidate pages");

  const records: PageRecord[] = [];
  for (const entry of scanned) {
    const info = await queryPageAuthor(session, entry.page);
    await sleep(queryDelay);
    if (!info) continue;
    if (info.createdAt <= since) continue;
    records.push({
      page: entry.page,
      pageId: info.pageId,
      author: info.author,
      createdAt: info.createdAt,
    });
  }

  log.info({ count: records.length }, "new pages resolved");
  return records;
}

async function renameToDeleted(session: Session, record: PageRecord): Promise<string | null> {
  const flattened = record.page.replace(/:/g, "-");
  const candidates = [
    `${deletedPrefix}${record.page}`,
    `${deletedPrefix}${flattened}`,
    `${deletedPrefix}${flattened}-${record.pageId}`,
  ];

  for (const candidate of new Set(candidates)) {
    if (await renamePage(session, record.pageId, candidate)) return candidate;
  }

  log.error({ page: record.page, pageId: record.pageId }, "unable to move page to deleted");
  return null;
}

async function handleGroups(
  session: Session,
  groups: PageRecord[][],
  handledPageIds: Set<string>
): Promise<{ group: DetectionGroup; failedNames: string[] }[]> {
  const results: { group: DetectionGroup; failedNames: string[] }[] = [];

  for (const group of groups) {
    const author = group[0]?.author;
    if (!author) continue;

    const pages: HandledPage[] = [];
    const failedNames: string[] = [];

    for (const record of group) {
      handledPageIds.add(record.pageId);
      const deletedName = await renameToDeleted(session, record);
      if (!deletedName) {
        failedNames.push(record.page);
        continue;
      }
      pages.push({
        pageId: record.pageId,
        originalName: record.page,
        deletedName,
        createdAt: record.createdAt,
      });
    }

    if (pages.length === 0) continue;
    results.push({ group: { author, pages }, failedNames });
  }

  return results;
}

async function runPageOperations(
  session: Session,
  thread: PendingThread,
  instruction: Instruction
): Promise<HandledPage[]> {
  const failed: HandledPage[] = [];

  for (const page of thread.pages) {
    const ok =
      instruction === "delete"
        ? await deletePage(session, page.pageId)
        : await renamePage(session, page.pageId, page.originalName);
    if (!ok) failed.push(page);
  }

  return failed;
}

function findInstruction(
  posts: ForumPost[],
  thread: PendingThread,
  admins: string[]
): { post: ForumPost; instruction: Instruction } | null {
  const replies = posts
    .filter((post) => post.parentId === thread.postId)
    .sort((left, right) => left.createdAt - right.createdAt);

  for (const reply of replies) {
    if (!admins.includes(reply.authorName.toLowerCase())) continue;
    const instruction = parseInstruction(reply.text);
    if (!instruction) continue;
    return { post: reply, instruction };
  }

  return null;
}

async function replyResult(
  session: Session,
  thread: PendingThread,
  found: { post: ForumPost; instruction: Instruction },
  failed: HandledPage[]
): Promise<void> {
  const postId = await savePost(session, {
    parentId: thread.postId,
    title: replyTitle,
    source: buildResultSource(thread, found.instruction, found.post.authorName, failed),
  });

  if (postId === null) {
    log.error({ postId: thread.postId }, "result reply failed to post");
  }
}

async function processPendingThreads(
  session: Session,
  threads: PendingThread[],
  startedAt: number
): Promise<PendingThread[]> {
  if (threads.length === 0) return threads;

  const admins = loadAdmins().map((name) => name.toLowerCase());
  const items = await fetchRssItems(session);
  const needsCheck = threads.filter((thread) =>
    items.some((item) => item.createdAt > thread.lastCheckedAt)
  );

  if (needsCheck.length === 0) {
    log.info({ pending: threads.length }, "no new forum replies");
    return threads;
  }

  const posts = await fetchThreadPosts(
    session,
    needsCheck.map((thread) => thread.postId)
  );
  const remaining: PendingThread[] = [];

  for (const thread of threads) {
    if (!needsCheck.includes(thread)) {
      remaining.push(thread);
      continue;
    }

    const found = findInstruction(posts, thread, admins);
    if (!found) {
      remaining.push({ ...thread, lastCheckedAt: startedAt });
      continue;
    }

    log.info(
      { postId: thread.postId, instruction: found.instruction, operator: found.post.authorName },
      "instruction received"
    );

    const failed = await runPageOperations(session, thread, found.instruction);

    if (failed.length > 0) {
      log.error(
        {
          postId: thread.postId,
          total: thread.totalPages,
          failed: failed.map((page) => page.deletedName),
        },
        "instruction partially failed, keeping thread for retry"
      );

      if (!thread.notifiedFailure) {
        await replyResult(session, thread, found, failed);
      }

      remaining.push({ ...thread, pages: failed, notifiedFailure: true });
      continue;
    }

    await replyResult(session, thread, found, []);
    log.info({ postId: thread.postId }, "thread resolved and removed from watch list");
  }

  return remaining;
}

async function main(): Promise<void> {
  const config = loadConfig();
  const timeline = loadTimeline();
  const startedAt = nowSeconds();

  if (!timeline) {
    saveTimeline(startedAt);
    log.info({ lastCheckedAt: startedAt }, "first run, only timeline saved");
    return;
  }

  const session = await login();
  const pendingThreads = loadPendingThreads();

  const freshRecords = await collectNewPages(session, timeline.lastCheckedAt);
  const records = mergeRecords(loadRecentPages(), freshRecords);
  const groups = detectBurstGroups(records, config.windowSeconds, config.pageThreshold);

  const handledPageIds = new Set<string>();
  const handled = await handleGroups(session, groups, handledPageIds);

  if (handled.length > 0) {
    const detectionFile = saveDetection(
      startedAt,
      handled.map((entry) => entry.group)
    );

    for (const entry of handled) {
      const postId = await savePost(session, {
        parentId: "",
        title: detectionTitle,
        source: buildDetectionSource(entry.group, entry.failedNames),
      });
      if (postId === null) {
        log.error({ author: entry.group.author }, "post failed, thread not tracked");
        continue;
      }
      pendingThreads.push({
        postId,
        author: entry.group.author,
        detectionFile,
        postedAt: startedAt,
        lastCheckedAt: startedAt,
        notifiedFailure: false,
        totalPages: entry.group.pages.length,
        pages: entry.group.pages,
      });
    }
  }

  const remaining = await processPendingThreads(session, pendingThreads, startedAt);

  savePendingThreads(remaining);
  saveRecentPages(pruneRecords(records, startedAt, config.windowSeconds, handledPageIds));
  saveTimeline(startedAt);

  log.info(
    { detected: handled.length, pending: remaining.length, lastCheckedAt: startedAt },
    "run finished"
  );
}

main().catch((err: unknown) => {
  log.error({ err }, "run failed");
  process.exitCode = 1;
});
