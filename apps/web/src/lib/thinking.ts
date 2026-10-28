const TOOL_LINE = /^\[Tool (call|result)\] (\S+)[ \t]*/;

/** Reads one balanced JSON object/array from the start of `s`; null when it does not start with one. */
function readJson(s: string): { json: string; rest: string } | null {
  if (s[0] !== '{' && s[0] !== '[') return null;
  let depth = 0;
  let inString = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inString) {
      if (c === '\\') i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') {
      if (--depth === 0) {
        const json = s.slice(0, i + 1);
        try {
          return { json: JSON.stringify(JSON.parse(json), null, 2), rest: s.slice(i + 1) };
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/** A code fence longer than any backtick run inside, so the content cannot close it. */
function fence(body: string, lang: string): string {
  const longest = Math.max(0, ...(body.match(/`+/g) ?? []).map((r) => r.length));
  const ticks = '`'.repeat(Math.max(3, longest + 1));
  return `${ticks}${lang}\n${body}\n${ticks}`;
}

/**
 * Turns the agent's thinking text into Markdown: `[Tool call] name {json}` and
 * `[Tool result] name {json}` lines become a heading plus an indented JSON code block; everything
 * else (the model's reasoning) is passed through as Markdown.
 */
export function formatThinking(text: string): string {
  const out: string[] = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = TOOL_LINE.exec(lines[i]);
    if (!m) {
      out.push(lines[i]);
      continue;
    }
    const [head, kind, name] = m;
    const label = `**Tool ${kind}** \`${name}\``;
    // The body may continue on the following lines (pretty-printed results), up to the next tool line.
    const tail = lines.slice(i + 1);
    const next = tail.findIndex((l) => TOOL_LINE.test(l));
    const own = next < 0 ? tail : tail.slice(0, next);
    const body = [lines[i].slice(head.length), ...own].join('\n');
    const parsed = readJson(body.trimStart());
    if (parsed) {
      out.push('', label, '', fence(parsed.json, 'json'), '');
      const rest = parsed.rest.trim();
      if (rest) out.push(rest);
    } else if (body.trim()) {
      out.push('', label, '', fence(body.trim(), ''), '');
    } else {
      out.push('', label, '');
    }
    i += own.length;
  }
  return out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
