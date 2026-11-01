/** One `diff -u` style hunk list for a file, `""` when the texts are equal. */
export function unifiedDiff(path: string, base: string, proposed: string, context = 3): string {
  if (base === proposed) return '';
  const a = base.split('\n');
  const b = proposed.split('\n');

  // Longest common subsequence table over lines (config files are small).
  const n = a.length;
  const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  type Op = { kind: ' ' | '-' | '+'; text: string };
  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ kind: ' ', text: a[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      ops.push({ kind: '-', text: a[i++] });
    } else {
      ops.push({ kind: '+', text: b[j++] });
    }
  }
  while (i < n) ops.push({ kind: '-', text: a[i++] });
  while (j < m) ops.push({ kind: '+', text: b[j++] });

  // Group changed ops with `context` unchanged lines around them into hunks.
  const changed = ops.flatMap((o, idx) => (o.kind === ' ' ? [] : [idx]));
  const hunks: [number, number][] = [];
  for (const idx of changed) {
    const from = Math.max(0, idx - context);
    const to = Math.min(ops.length - 1, idx + context);
    const last = hunks[hunks.length - 1];
    if (last && from <= last[1] + 1) last[1] = Math.max(last[1], to);
    else hunks.push([from, to]);
  }

  const out = [`--- a/${path}`, `+++ b/${path}`];
  for (const [from, to] of hunks) {
    const slice = ops.slice(from, to + 1);
    const before = ops.slice(0, from);
    const startA = before.filter((o) => o.kind !== '+').length + 1;
    const startB = before.filter((o) => o.kind !== '-').length + 1;
    const lenA = slice.filter((o) => o.kind !== '+').length;
    const lenB = slice.filter((o) => o.kind !== '-').length;
    out.push(`@@ -${startA},${lenA} +${startB},${lenB} @@`);
    for (const o of slice) out.push(`${o.kind}${o.text}`);
  }
  return out.join('\n');
}
