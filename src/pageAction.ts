import { callAmc } from "./ajax.js";
import { log } from "./log.js";
import type { Session } from "./types.js";

export async function renamePage(
  session: Session,
  pageId: string,
  newName: string
): Promise<boolean> {
  const resp = await callAmc(session, {
    action: "WikiPageAction",
    event: "renamePage",
    page_id: pageId,
    new_name: newName,
    moduleName: "Empty",
    callbackIndex: 1,
  });

  if (resp?.status !== "ok") {
    log.warn({ pageId, newName, status: resp?.status, message: resp?.message }, "rename failed");
    return false;
  }

  log.info({ pageId, newName }, "renamed");
  return true;
}

export async function deletePage(session: Session, pageId: string): Promise<boolean> {
  const resp = await callAmc(session, {
    action: "WikiPageAction",
    event: "deletePage",
    page_id: pageId,
    moduleName: "Empty",
    callbackIndex: 1,
  });

  if (resp?.status !== "ok") {
    log.warn({ pageId, status: resp?.status, message: resp?.message }, "delete failed");
    return false;
  }

  log.info({ pageId }, "deleted");
  return true;
}
