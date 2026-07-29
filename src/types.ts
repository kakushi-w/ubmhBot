export interface BotConfig {
  wiki: string;
  threadId: number;
  windowSeconds: number;
  pageThreshold: number;
  userAgent: string;
}

export interface Session {
  cookie: string;
  token7: string;
}

export interface AmcResponse {
  status?: string;
  body?: string;
  message?: string;
  postId?: number;
}

export interface SitemapEntry {
  page: string;
  lastmod: number | null;
}

export interface PageAuthorInfo {
  pageId: string;
  author: string;
  createdAt: number;
}

export interface PageRecord {
  page: string;
  pageId: string;
  author: string;
  createdAt: number;
}

export interface HandledPage {
  pageId: string;
  originalName: string;
  deletedName: string;
  createdAt: number;
}

export interface DetectionGroup {
  author: string;
  pages: HandledPage[];
}

export interface DetectionFile {
  detectedAt: number;
  groups: DetectionGroup[];
}

export interface PendingThread {
  postId: number;
  author: string;
  detectionFile: string;
  postedAt: number;
  lastCheckedAt: number;
  notifiedFailure: boolean;
  totalPages: number;
  pages: HandledPage[];
}

export interface Timeline {
  lastCheckedAt: number;
}

export interface RssItem {
  postId: number;
  authorName: string;
  createdAt: number;
}

export interface ForumPost {
  postId: number;
  parentId: number | null;
  authorName: string;
  createdAt: number;
  text: string;
}

export type Instruction = "delete" | "restore";
