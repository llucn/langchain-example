import { describe, expect, it } from 'vitest';
import { formatThinking } from './thinking';

describe('formatThinking', () => {
  it('pretty-prints the JSON of a tool call', () => {
    const out = formatThinking('[Tool call] selectAgent {"agentName":"other","confidence":0.9}');
    expect(out).toBe(
      '**Tool call** `selectAgent`\n\n```json\n{\n  "agentName": "other",\n  "confidence": 0.9\n}\n```',
    );
  });

  it('keeps reasoning text and formats the tool lines around it', () => {
    const out = formatThinking(
      'Need the order.\n[Tool call] getOrder {"id":1}\n[Tool result] getOrder {"ok":true}\nDone.',
    );
    expect(out).toContain('Need the order.\n\n**Tool call** `getOrder`');
    expect(out).toContain(
      '**Tool result** `getOrder`\n\n```json\n{\n  "ok": true\n}\n```\n\nDone.',
    );
  });

  it('handles results that are already pretty-printed over several lines', () => {
    const out = formatThinking('[Tool result] t {\n  "a": [1, 2]\n}');
    expect(out).toBe('**Tool result** `t`\n\n```json\n{\n  "a": [\n    1,\n    2\n  ]\n}\n```');
  });

  it('shows non-JSON results as a plain code block', () => {
    expect(formatThinking('[Tool result] t 401 Unauthorized')).toBe(
      '**Tool result** `t`\n\n```\n401 Unauthorized\n```',
    );
  });

  it('is not confused by braces and quotes inside JSON strings', () => {
    const out = formatThinking('[Tool call] t {"s":"a } \\" ] b"}');
    expect(out).toContain('"s": "a } \\" ] b"');
  });

  it('uses a longer fence when the content has backticks', () => {
    const out = formatThinking('[Tool result] t {"s":"```"}');
    expect(out).toContain('````json');
  });

  it('leaves plain Markdown untouched', () => {
    expect(formatThinking('**Thinking** about it')).toBe('**Thinking** about it');
  });
});
