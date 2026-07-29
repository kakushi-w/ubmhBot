import * as cheerio from "cheerio";
import { XMLParser } from "fast-xml-parser";
import { callAmc, fetchText } from "./ajax.js";
import { loadConfig, siteUrl } from "./config.js";
import { log } from "./log.js";
import { toArray } from "./util.js";
import type { ForumPost, RssItem, Session } from "./types.js";

const maxPagerScan = 20;

const rssParser = new XMLParser({
  ignoreAttributes: true,
  removeNSPrefix: true,
  trimValues: true,
});

interface RssNode {
  guid?: string;
  link?: string;
  pubDate?: string;
  authorName?: string;
}

interface RssDoc {
  rss?: { channel?: { item?: RssNode | RssNode[] } };
}

async function fetchThreadPage(session: Session, pageNo: number): Promise<string | null> {
  const config = loadConfig();
  const resp = await callAmc(session, {
    pageNo,
    t: config.threadId,
    order: "",
    moduleName: "forum/ForumViewThreadPostsModule",
    callbackIndex: 3,
  });

  if (resp?.status !== "ok" || !resp.body) {
    log.warn({ pageNo, status: resp?.status, message: resp?.message }, "thread page fetch failed");
    return null;
  }

  return resp.body;
}

export async function savePost(
  session: Session,
  options: { parentId: number | ""; title: string; source: string }
): Promise<number | null> {
  const config = loadConfig();
  const resp = await callAmc(session, {
    threadId: config.threadId,
    parentId: options.parentId === "" ? "" : options.parentId,
    title: options.title,
    source: options.source,
    action: "ForumAction",
    event: "savePost",
    moduleName: "Empty",
    callbackIndex: 2,
  });

  if (resp?.status !== "ok" || typeof resp.postId !== "number") {
    log.warn({ status: resp?.status, message: resp?.message }, "savePost failed");
    return null;
  }

  log.info({ postId: resp.postId, parentId: options.parentId }, "post saved");
  return resp.postId;
}

export async function fetchRssItems(session: Session): Promise<RssItem[]> {
  const config = loadConfig();
  const xml = await fetchText(session, `${siteUrl()}/feed/forum/t-${config.threadId}.xml`);
  if (!xml) {
    log.warn({}, "forum rss fetch failed");
    return [];
  }

  const doc = rssParser.parse(xml) as RssDoc;
  const items: RssItem[] = [];

  for (const node of toArray(doc.rss?.channel?.item)) {
    const source = node.guid ?? node.link ?? "";
    const match = source.match(/#post-(\d+)/);
    if (!match) continue;
    const parsedDate = node.pubDate ? Date.parse(node.pubDate) : Number.NaN;
    items.push({
      postId: parseInt(match[1] ?? "", 10),
      authorName: node.authorName ?? "",
      createdAt: Number.isNaN(parsedDate) ? 0 : Math.floor(parsedDate / 1000),
    });
  }

  return items;
}

function parsePagerMax(html: string): number {
  const $ = cheerio.load(html);
  let max = 1;

  $("div.pager")
    .find("span.target a, span.current")
    .each((_, element) => {
      const value = parseInt($(element).text().trim(), 10);
      if (!Number.isNaN(value) && value > max) max = value;
    });

  return Math.min(max, maxPagerScan);
}

function collectPosts(html: string, into: Map<number, ForumPost>): void {
  const $ = cheerio.load(html);

  $("div.post-container").each((_, element) => {
    const container = $(element);
    const postEl = container.children("div.post").first();
    const idMatch = (postEl.attr("id") ?? "").match(/^post-(\d+)$/);
    if (!idMatch) return;

    const postId = parseInt(idMatch[1] ?? "", 10);
    if (into.has(postId)) return;

    let parentId: number | null = null;
    const parentContainer = container.parent().closest("div.post-container");
    if (parentContainer.length) {
      const parentAttr = parentContainer.children("div.post").first().attr("id") ?? "";
      const parentMatch = parentAttr.match(/^post-(\d+)$/);
      if (parentMatch) parentId = parseInt(parentMatch[1] ?? "", 10);
    }

    const info = postEl.children("div.long").children("div.head").children("div.info");
    const authorLink = info.find("span.printuser a[href*='/user:info/']").last();
    const timeMatch = (info.find("span.odate").first().attr("class") ?? "").match(/time_(\d+)/);

    into.set(postId, {
      postId,
      parentId,
      authorName: authorLink.text().trim(),
      createdAt: timeMatch ? parseInt(timeMatch[1] ?? "", 10) : 0,
      text: $(`#post-content-${postId}`).text().replace(/\s+/g, " ").trim(),
    });
  });
}

export function parseThreadHtml(html: string): ForumPost[] {
  const posts = new Map<number, ForumPost>();
  collectPosts(html, posts);
  return [...posts.values()];
}

export async function fetchThreadPosts(
  session: Session,
  wantedPostIds: number[]
): Promise<ForumPost[]> {
  const collected = new Map<number, ForumPost>();

  const firstBody = await fetchThreadPage(session, 1);
  if (!firstBody) return [];
  collectPosts(firstBody, collected);

  const missing = new Set(wantedPostIds.filter((id) => !collected.has(id)));
  const lastPage = parsePagerMax(firstBody);

  for (let pageNo = lastPage; pageNo >= 2 && missing.size > 0; pageNo--) {
    const body = await fetchThreadPage(session, pageNo);
    if (!body) continue;
    collectPosts(body, collected);
    for (const id of [...missing]) {
      if (collected.has(id)) missing.delete(id);
    }
  }

  if (missing.size > 0) {
    log.warn({ missing: [...missing], lastPage }, "some bot posts not found in thread");
  }

  log.info({ count: collected.size, lastPage }, "thread posts parsed");
  return [...collected.values()];
}
