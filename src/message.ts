import { siteUrl } from "./config.js";
import type { DetectionGroup, HandledPage, Instruction, PendingThread } from "./types.js";

export const detectionTitle = "异常页面检出";
export const replyTitle = "Re: 异常页面检出";

const deleteKeyword = "删除";
const restoreKeyword = "恢复";

export function buildDetectionSource(group: DetectionGroup, failedNames: string[]): string {
  const total = group.pages.length + failedNames.length;
  const links = group.pages.map((page) => `${siteUrl()}/${page.deletedName}`).join("\n");

  const lines = [
    `[[*user ${group.author}]]，连续发送了**${total}**个页面，疑似存在批量刷页面行为`,
    "以下是被移动到{{deleted}}分类的页面列表",
    '[[collapsible show="展开所有页面" hide="收起所有页面"]]',
    links,
    "",
    "[[/collapsible]]",
    "",
  ];

  if (failedNames.length > 0) {
    lines.push(`以下页面移动失败，需要人工处理：${failedNames.join("、")}`, "");
  }

  lines.push(
    "请管理员人工审查后，用下列指示命令机器人。",
    `回复**${deleteKeyword}**，将删除所有页面。`,
    `回复**${restoreKeyword}**，将恢复所有页面。`
  );

  return lines.join("\n");
}

export function parseInstruction(text: string): Instruction | null {
  const hasDelete = text.includes(deleteKeyword);
  const hasRestore = text.includes(restoreKeyword);
  if (hasDelete === hasRestore) return null;
  return hasDelete ? "delete" : "restore";
}

export function buildResultSource(
  thread: PendingThread,
  instruction: Instruction,
  operatorName: string,
  failedPages: HandledPage[]
): string {
  const verb = instruction === "delete" ? deleteKeyword : restoreKeyword;
  const total = thread.totalPages;
  const doneCount = total - failedPages.length;
  const lines: string[] = [];

  if (failedPages.length > 0) {
    lines.push(
      `已按[[*user ${operatorName}]]的指示${verb}[[*user ${thread.author}]]的**${total}**个页面中的**${doneCount}**个。`,
      `以下**${failedPages.length}**个页面${verb}失败，机器人会在后续检查中重试，如长期未恢复请人工处理：`,
      failedPages.map((page) => `${siteUrl()}/${page.deletedName}`).join("\n")
    );
  } else if (thread.notifiedFailure) {
    lines.push(
      `已按[[*user ${operatorName}]]的指示${verb}剩余的**${thread.pages.length}**个页面，[[*user ${thread.author}]]的**${total}**个页面已全部${verb}完毕。`
    );
  } else {
    lines.push(
      `已按[[*user ${operatorName}]]的指示${verb}[[*user ${thread.author}]]的**${total}**个页面。`
    );
  }

  return lines.join("\n");
}
