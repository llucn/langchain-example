import { describe, expect, it } from 'vitest';
import { draftProblem, pageCount } from './memoryView';

describe('memory view helpers', () => {
  it('counts pages, at least one', () => {
    expect(pageCount(0, 50)).toBe(1);
    expect(pageCount(50, 50)).toBe(1);
    expect(pageCount(51, 50)).toBe(2);
  });

  it('validates a draft after collapsing whitespace', () => {
    expect(draftProblem('   ')).toMatch(/Write/);
    expect(draftProblem('x'.repeat(501))).toMatch(/500/);
    expect(draftProblem(' fine  note ')).toBeNull();
  });
});
