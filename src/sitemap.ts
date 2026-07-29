import { XMLParser } from "fast-xml-parser";
import { fetchText } from "./ajax.js";
import { loadConfig, siteUrl } from "./config.js";
import { log } from "./log.js";
import { toArray } from "./util.js";
import type { Session, SitemapEntry } from "./types.js";

const skippedPrefixes = ["deleted:", "forum/", "feed/"];

interface UrlNode {
  loc?: string;
  lastmod?: string;
}

interface SitemapDoc {
  urlset?: { url?: UrlNode | UrlNode[] };
  sitemapindex?: { sitemap?: UrlNode | UrlNode[] };
}

const parser = new XMLParser({ ignoreAttributes: true, trimValues: true });

function pageFromLoc(loc: string): string | null {
  const host = `${loadConfig().wiki}.wikidot.com`;
  const match = loc.match(/^https?:\/\/([^/]+)(\/.*)?$/);
  if (!match || match[1] !== host) return null;
  const rest = (match[2] ?? "").replace(/^\//, "").replace(/\/$/, "");
  if (!rest) return null;
  return decodeURIComponent(rest);
}

function parseLastmod(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : Math.floor(parsed / 1000);
}

async function parseDocument(
  session: Session,
  url: string,
  depth: number
): Promise<SitemapEntry[]> {
  const xml = await fetchText(session, url);
  if (!xml) {
    log.warn({ url }, "sitemap fetch failed");
    return [];
  }

  const doc = parser.parse(xml) as SitemapDoc;

  if (doc.urlset) {
    const entries: SitemapEntry[] = [];
    for (const node of toArray(doc.urlset.url)) {
      const page = node.loc ? pageFromLoc(node.loc) : null;
      if (!page) continue;
      if (skippedPrefixes.some((prefix) => page.startsWith(prefix))) continue;
      entries.push({ page, lastmod: parseLastmod(node.lastmod) });
    }
    return entries;
  }

  if (doc.sitemapindex && depth < 2) {
    const entries: SitemapEntry[] = [];
    for (const node of toArray(doc.sitemapindex.sitemap)) {
      if (!node.loc) continue;
      entries.push(...(await parseDocument(session, node.loc, depth + 1)));
    }
    return entries;
  }

  log.warn({ url }, "sitemap has no recognizable root");
  return [];
}

export async function fetchSitemap(session: Session): Promise<SitemapEntry[]> {
  const entries = await parseDocument(session, `${siteUrl()}/sitemap.xml`, 0);
  log.info({ count: entries.length }, "sitemap loaded");
  return entries;
}
