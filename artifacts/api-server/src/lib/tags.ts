export interface ParsedTags {
  sleep: number | null;
  silent: boolean;
  endDiscussion: boolean;
  replyTo: number | null;
  context: number | null;
  multi: boolean;
  font: string | null;
  agentMention: string | null;
  react: string | null;
}

const DEFAULTS: ParsedTags = {
  sleep: null,
  silent: false,
  endDiscussion: false,
  replyTo: null,
  context: null,
  multi: false,
  font: null,
  agentMention: null,
  react: null,
};

export function parseTags(text: string): { tags: ParsedTags; clean: string } {
  const tags: ParsedTags = { ...DEFAULTS };

  const sleepMatch = text.match(/\[SLEEP:(\d+)\]/);
  if (sleepMatch) tags.sleep = parseInt(sleepMatch[1]);

  if (text.includes("[SILENT]")) tags.silent = true;
  if (text.includes("[END_DISCUSSION]")) tags.endDiscussion = true;
  if (text.includes("[MULTI]")) tags.multi = true;

  const replyMatch = text.match(/\[REPLY:(\d+)\]/);
  if (replyMatch) tags.replyTo = parseInt(replyMatch[1]);

  const ctxMatch = text.match(/\[CONTEXT:(\d+)\]/);
  if (ctxMatch) tags.context = parseInt(ctxMatch[1]);

  const fontMatch = text.match(/\[FONT:(\w+)\]/);
  if (fontMatch) tags.font = fontMatch[1];

  const agentMatch = text.match(/\[AGENT:(@\w+)\]/);
  if (agentMatch) tags.agentMention = agentMatch[1];

  const reactMatch = text.match(/\[REACT:(.+?)\]/);
  if (reactMatch) tags.react = reactMatch[1].trim();

  const clean = text
    .replace(/\[SLEEP:\d+\]/g, "")
    .replace(/\[SILENT\]/g, "")
    .replace(/\[END_DISCUSSION\]/g, "")
    .replace(/\[MULTI\]/g, "")
    .replace(/\[REPLY:\d+\]/g, "")
    .replace(/\[CONTEXT:\d+\]/g, "")
    .replace(/\[FONT:\w+\]/g, "")
    .replace(/\[AGENT:@\w+\]/g, "")
    .replace(/\[REACT:.+?\]/g, "")
    .trim();

  return { tags, clean };
}
