import { sampleAgentConfig } from '../../agent-config/sample-config';
import type { StructuredCaller } from '../evolution.model';
import { judgeReplay } from './judge';
import { historyFor, memoriesFor, noMemory, replayTurn, type ReplayRunner } from './replay';
import { UNRECORDED_RESULT } from './recorded-mcp';

const inventory = [
  {
    name: 'work_order_createWorkOrder',
    description: 'Create',
    source: 'work_order',
    inputSchema: { type: 'object', properties: { title: { type: 'string' } } },
  },
];
const config = sampleAgentConfig();

describe('replayTurn', () => {
  it('flags a call without a recorded result and never persists or connects', async () => {
    let seen: unknown;
    const run: ReplayRunner = async (_c, _h, ctx) => {
      seen = ctx;
      const tool = ctx.mcp!.tools[0];
      const result = await tool.invoke({ title: 'Elevator stuck' } as never);
      expect(result).toBe(UNRECORDED_RESULT);
      ctx.log?.onLlm({
        agent: 'fault_report',
        content: '',
        thinking: null,
        toolCalls: [
          { id: '1', name: 'renameSession', args: { name: 'Elevator' } },
          { id: '2', name: 'work_order_createWorkOrder', args: { title: 'Elevator stuck' } },
        ],
        model: null,
        startedAt: null,
        durationMs: null,
        metadata: {},
      });
      return { answer: 'Work order created.', agent: 'fault_report' };
    };
    const out = await replayTurn(run, {
      config,
      entryAgent: 'fault_report',
      history: [{ role: 'user', content: 'elevator stuck' }],
      recorded: [],
      inventory,
    });
    expect(out.text).toBe('Work order created.');
    expect(out.toolCalls).toEqual([
      { name: 'renameSession', args: { name: 'Elevator' }, unrecorded: false },
      { name: 'work_order_createWorkOrder', args: { title: 'Elevator stuck' }, unrecorded: true },
    ]);
    expect((seen as { sessionId: string; agent: string }).agent).toBe('fault_report');
  });
});

describe('historyFor', () => {
  const ev = (seq: number, turnId: string, type: string, content: string) => ({
    seq,
    turnId,
    type,
    content,
  });
  it('uses earlier inputs and final answers, then the turn user message', () => {
    const events = [
      ev(1, 'a', 'user_input', 'hi'),
      ev(2, 'a', 'llm_tool_use', ''),
      ev(3, 'a', 'llm_end_turn', 'hello'),
      ev(4, 'b', 'user_input', 'elevator'),
      ev(5, 'b', 'llm_end_turn', 'which floor?'),
    ];
    expect(historyFor(events, 'b')).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
      { role: 'user', content: 'elevator' },
    ]);
  });
});

describe('judgeReplay', () => {
  const out = { text: 'x', agent: 'a', toolCalls: [] };
  const caller = (verdict = 'improved'): StructuredCaller & { n: number } => ({
    n: 0,
    async call(o) {
      this.n++;
      return o.schema.parse({ verdict, reason: 'because' }) as never;
    },
  });

  it('is inconclusive without a model call when a target review has no text', async () => {
    const c = caller();
    const v = await judgeReplay(c, {
      kind: 'target',
      userMessage: 'u',
      review: { comment: null, expectedResult: null },
      old: out,
      new: out,
    });
    expect(v.verdict).toBe('inconclusive');
    expect(c.n).toBe(0);
  });

  it('asks the model otherwise, also for a regression review without text', async () => {
    const c = caller('same');
    const v = await judgeReplay(c, {
      kind: 'regression',
      userMessage: 'u',
      review: { comment: null, expectedResult: null },
      old: out,
      new: out,
    });
    expect(v).toEqual({ verdict: 'same', reason: 'because' });
    expect(c.n).toBe(1);
  });
});

describe('replay and memories', () => {
  it('injects the recorded memory texts into the run', async () => {
    let seen: { memories?: { content: string }[] } = {};
    const run: ReplayRunner = async (_c, _h, ctx) => {
      seen = ctx;
      return { answer: 'ok', agent: 'other' };
    };
    await replayTurn(run, {
      config,
      entryAgent: 'other',
      history: [{ role: 'user', content: 'hi' }],
      recorded: [],
      inventory,
      memories: ['Works in building 3', 'Prefers Chinese'],
    });
    expect(seen.memories?.map((m) => m.content)).toEqual([
      'Works in building 3',
      'Prefers Chinese',
    ]);
  });

  it('injects none when the log had none', async () => {
    let seen: { memories?: unknown[] } = {};
    const run: ReplayRunner = async (_c, _h, ctx) => {
      seen = ctx;
      return { answer: 'ok', agent: 'other' };
    };
    await replayTurn(run, {
      config,
      entryAgent: 'other',
      history: [{ role: 'user', content: 'hi' }],
      recorded: [],
      inventory,
    });
    expect(seen.memories).toEqual([]);
  });

  it('reads the memories of the turn from its first model event that logged them', () => {
    const events = [
      { seq: 1, turnId: 'a', metadata: { memories: ['old'] } },
      { seq: 2, turnId: 'b', metadata: {} },
      { seq: 3, turnId: 'b', metadata: { memories: ['x', 'y'] } },
    ];
    expect(memoriesFor(events, 'b')).toEqual(['x', 'y']);
    expect(memoriesFor(events, 'c')).toEqual([]);
  });

  it('uses a memory store that reads and writes nothing', async () => {
    expect(await noMemory.recent(null, 30)).toEqual([]);
    expect((await noMemory.save('u', 'x', null)).created).toBe(true);
    await expect(noMemory.remove('u', 'id')).resolves.toBeUndefined();
  });
});
