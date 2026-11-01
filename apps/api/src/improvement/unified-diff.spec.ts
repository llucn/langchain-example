import { unifiedDiff } from './unified-diff';

describe('unifiedDiff', () => {
  it('is empty for equal texts', () => {
    expect(unifiedDiff('a.yml', 'x\ny', 'x\ny')).toBe('');
  });

  it('shows a replaced line with context and hunk header', () => {
    const base = ['1', '2', '3', '4', '5', '6', '7', '8'].join('\n');
    const next = ['1', '2', '3', 'four', '5', '6', '7', '8'].join('\n');
    expect(unifiedDiff('agents/x.yml', base, next)).toBe(
      [
        '--- a/agents/x.yml',
        '+++ b/agents/x.yml',
        '@@ -1,7 +1,7 @@',
        ' 1',
        ' 2',
        ' 3',
        '-4',
        '+four',
        ' 5',
        ' 6',
        ' 7',
      ].join('\n'),
    );
  });

  it('splits distant changes into two hunks', () => {
    const lines = Array.from({ length: 30 }, (_, i) => String(i));
    const next = [...lines];
    next[2] = 'a';
    next[27] = 'b';
    const d = unifiedDiff('f', lines.join('\n'), next.join('\n'));
    expect(d.match(/^@@/gm)).toHaveLength(2);
  });

  it('handles added and removed lines', () => {
    expect(unifiedDiff('f', 'a\nb', 'a\nb\nc')).toContain('+c');
    expect(unifiedDiff('f', 'a\nb\nc', 'a\nc')).toContain('-b');
  });
});
