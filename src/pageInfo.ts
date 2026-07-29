import * as cheerio from "cheerio";
import { callAmc, fetchText } from "./ajax.js";
import { siteUrl } from "./config.js";
import { log } from "./log.js";
import type { PageAuthorInfo, Session } from "./types.js";

export async function getPageId(session: Session, page: string): Promise<string | null> {
  const html = await fetchText(session, `${siteUrl()}/${page}`);
  if (!html) return null;
  const match = html.match(/WIKIREQUEST\.info\.pageId\s*=\s*(\d+);/);
  return match?.[1] ?? null;
}

export async function queryPageAuthor(
  session: Session,
  page: string
): Promise<PageAuthorInfo | null> {
  const pageId = await getPageId(session, page);
  if (!pageId) {
    log.warn({ page }, "pageId not found");
    return null;
  }

  const resp = await callAmc(session, {
    moduleName: "history/PageRevisionListModule",
    page: 1,
    perpage: 10000,
    page_id: pageId,
  });

  if (resp?.status !== "ok" || !resp.body) {
    log.warn({ page, status: resp?.status }, "revision list failed");
    return null;
  }

  const $ = cheerio.load(resp.body);
  const rows = $("tr[id^='revision-row-']");
  if (!rows.length) {
    log.warn({ page }, "no revision rows");
    return null;
  }

  let author: string | null = null;
  let createdAt: number | null = null;

  rows.each((_, row) => {
    const cells = $(row).find("td");
    const revision = cells.first().text().trim().replace(/\.$/, "");
    if (revision !== "0") return;

    const avatar = $(row).find("img[alt]").first();
    if (avatar.length) author = avatar.attr("alt")?.trim() ?? null;

    if (!author) {
      const userLink = $(row).find("a[href*='/user:info/']").first();
      if (userLink.length) author = userLink.text().trim() || null;
    }

    const timeSpan = $(row).find("span[class*='time_']").first();
    const timeMatch = (timeSpan.attr("class") ?? "").match(/time_(\d+)/);
    if (timeMatch) createdAt = parseInt(timeMatch[1] ?? "", 10);
  });

  if (!author || !createdAt) {
    log.warn({ page, author, createdAt }, "revision 0 not resolved");
    return null;
  }

  return { pageId, author, createdAt };
}
