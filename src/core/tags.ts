export interface ParsedTags {
  sleep?: number;
  silent?: boolean;
  endDiscussion?: boolean;
  replyTo?: number;
  react?: string;
}

export function parseTags(raw: string): { tags: ParsedTags; clean: string } {
  const tags: ParsedTags = {};
  let text = raw;

  const sleepM = text.match(/\[SLEEP:(\d+(?:\.\d+)?)\]/i);
  if (sleepM) { tags.sleep = parseFloat(sleepM[1]!); text = text.replace(sleepM[0], ""); }

  if (/\[SILENT\]/i.test(text)) { tags.silent = true; text = text.replace(/\[SILENT\]/gi, ""); }

  if (/\[END_DISCUSSION\]/i.test(text)) { tags.endDiscussion = true; text = text.replace(/\[END_DISCUSSION\]/gi, ""); }

  const replyM = text.match(/\[REPLY:(\d+)\]/i);
  if (replyM) { tags.replyTo = parseInt(replyM[1]!); text = text.replace(replyM[0], ""); }

  const reactM = text.match(/\[REACT:(.+?)\]/i);
  if (reactM) { tags.react = reactM[1]!.trim(); text = text.replace(reactM[0], ""); }

  return { tags, clean: text.trim() };
}
