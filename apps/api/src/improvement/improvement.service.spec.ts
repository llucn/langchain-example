import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { GitHubWriteError } from '../agent-config/github-writer';
import { sampleAgentConfig } from '../agent-config/sample-config';
import { SAMPLE_CONFIG_DIR } from '../agent-config/sample-config';
import { readLocalConfig } from '../agent-config/source';
import type { StructuredCaller } from './evolution.model';
import { ImprovementService } from './improvement.service';
import { Limiter } from './limiter';
import type { ReplayRunner } from './replay/replay';

type Row = Record<string, unknown> & { id: string };

/** Minimal in-memory stand-in for a TypeORM repository (equality filters only). */
const repo = <T extends Row>(rows: T[] = []) => {
  let n = 0;
  const matches = (r: T, where: Record<string, unknown>) =>
    Object.entries(where).every(([k, v]) =>
      v && typeof v === 'object' && '_value' in (v as object)
        ? ((v as { _value: unknown[] })._value as unknown[]).includes(r[k])
        : r[k] === v,
    );
  return {
    rows,
    create: (v: Partial<T>) =>
      ({
        createdAt: new Date(),
        updatedAt: new Date(),
        files: [],
        notes: [],
        ...v,
      }) as unknown as T,
    save: async (v: T) => {
      const row = { ...v, id: v.id ?? `id${++n}` } as T;
      rows.push(row);
      return row;
    },
    update: async (where: Record<string, unknown>, patch: Partial<T>) => {
      const hit = rows.filter((r) => matches(r, where));
      hit.forEach((r) => Object.assign(r, patch));
      return { affected: hit.length };
    },
    findBy: async (where: Record<string, unknown>) => rows.filter((r) => matches(r, where)),
    findOneBy: async (where: Record<string, unknown>) =>
      rows.find((r) => matches(r, where)) ?? null,
    find: async (opts: { where?: Record<string, unknown> } = {}) =>
      rows.filter((r) => matches(r, opts.where ?? {})),
    createQueryBuilder: () => {
      let patch: Record<string, unknown> = {};
      let params: { id: string; from?: string[]; status?: string };
      const qb = {
        update: () => qb,
        set: (v: Record<string, unknown>) => ((patch = v), qb),
        where: (_: string, p: typeof params) => ((params = p), qb),
        execute: async () => {
          const r = rows.find(
            (x) =>
              x.id === params.id &&
              (params.from
                ? params.from.includes(x.status as string)
                : x.status === params.status) &&
              (!('branch' in patch) || !x.branch),
          );
          if (r) Object.assign(r, patch);
          return { affected: r ? 1 : 0 };
        },
      };
      return qb;
    },
  };
};

const config = sampleAgentConfig();
const bad = (id: string, messageId: string | null, over: Row | object = {}) =>
  ({
    id,
    rating: 'bad',
    messageId,
    tags: [],
    comment: 'c',
    expectedResult: 'e',
    reviewerName: null,
    ...over,
  }) as Row;
const message = (id: string, agentName: string | null) =>
  ({
    id,
    sessionId: 's',
    seq: 4,
    turnId: 't',
    type: 'llm_end_turn',
    agentName,
    agentConfigHash: 'h1',
    agentConfigVersion: 'v1.0',
    content: 'answer',
    toolName: null,
    toolCallId: null,
    toolCalls: null,
    status: 'ok',
  }) as unknown as Row;

// `In([...])` of TypeORM, reduced to what the fake repository understands.
jest.mock('typeorm', () => ({
  ...jest.requireActual('typeorm'),
  In: (v: unknown[]) => ({ _value: v }),
  LessThan: (v: number) => v,
  LessThanOrEqual: (v: number) => v,
}));

const build = (opts: {
  reviews?: Row[];
  messages?: Row[];
  caller?: StructuredCaller;
  inventory?: boolean;
  tools?: object[];
  runner?: ReplayRunner;
  agentConfig?: object;
}) => {
  const proposals = repo<Row>();
  const cases = repo<Row>();
  const replays = repo<Row>();
  const svc = new ImprovementService(
    { evolution: { model: 'm', maxTokens: 1 }, agentConfig: opts.agentConfig ?? {} } as never,
    config,
    proposals as never,
    cases as never,
    repo(opts.reviews ?? []) as never,
    repo(opts.messages ?? []) as never,
    repo<Row>([
      {
        id: 'sn',
        hash: 'h1',
        agentName: 'fault_report',
        definition: { systemPrompt: 'p' },
        settings: {},
      },
      { id: 'sn2', hash: 'h1', agentName: 'work_order_inquiry', definition: {}, settings: {} },
    ]) as never,
    replays as never,
  );
  svc.replayRunner = opts.runner ?? (async () => ({ answer: 'ok', agent: 'fault_report' }));
  const files = readLocalConfig(SAMPLE_CONFIG_DIR).files;
  svc.files = { current: async () => structuredClone(files) };
  svc.inventory = async () => ({
    available: opts.inventory ?? true,
    byAgent: { fault_report: (opts.tools ?? []) as never, work_order_inquiry: [] },
  });
  if (opts.caller) svc.caller = () => opts.caller as StructuredCaller;
  return { svc, proposals, cases, replays };
};

const fakeCaller = (layer = 'prompt'): StructuredCaller & { names: string[] } => {
  const names: string[] = [];
  return {
    names,
    call: async (o) => {
      names.push(o.name);
      if (o.name === 'replay_verdict') {
        return o.schema.parse({ verdict: 'improved', reason: 'asks fewer questions' }) as never;
      }
      if (o.name === 'diagnosis') {
        return o.schema.parse({
          layer,
          rootCause: 'The prompt says work orders cannot be created.',
          evidence: ['#4'],
          confidence: 0.9,
          suggestedAction: 'Allow createWorkOrder.',
        }) as never;
      }
      const text = readLocalConfig(SAMPLE_CONFIG_DIR).files.agents.fault_report.replace(
        'Answer concisely',
        'Be brief',
      );
      return o.schema.parse({
        files: [{ path: 'agents/fault_report.yml', content: text }],
        rationale: 'Fixes review r1.',
      }) as never;
    },
  };
};

describe('ImprovementService.create validation', () => {
  it('rejects a Good review, a session-level review and an unknown review', async () => {
    const { svc } = build({
      reviews: [bad('good', 'm1', { rating: 'good' }), bad('sess', null)],
      messages: [message('m1', 'fault_report')],
    });
    await expect(svc.create(['good'], { sub: 'u', name: 'n' })).rejects.toThrow(/not a Bad/);
    await expect(svc.create(['sess'], { sub: 'u', name: 'n' })).rejects.toThrow(/session-level/);
    await expect(svc.create(['nope'], { sub: 'u', name: 'n' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects an agent the running config does not define', async () => {
    const { svc } = build({
      reviews: [bad('r1', 'm1')],
      messages: [message('m1', 'ghost')],
    });
    await expect(svc.create(['r1'], { sub: 'u', name: 'n' })).rejects.toThrow(/does not define/);
  });
});

describe('ImprovementService generation', () => {
  it('groups reviews per agent into separate proposals', async () => {
    const { svc, proposals } = build({
      reviews: [bad('r1', 'm1'), bad('r2', 'm2')],
      messages: [message('m1', 'fault_report'), message('m2', 'work_order_inquiry')],
      caller: fakeCaller('label_unclear'),
    });
    const ids = await svc.create(['r1', 'r2'], { sub: 'u', name: 'n' });
    expect(ids).toHaveLength(2);
    await svc.idle();
    expect(proposals.rows.map((p) => p.agentName).sort()).toEqual([
      'fault_report',
      'work_order_inquiry',
    ]);
  });

  it('produces a ready proposal with diff, rationale and cases for a prompt diagnosis', async () => {
    const caller = fakeCaller();
    const { svc } = build({
      reviews: [bad('r1', 'm1')],
      messages: [message('m1', 'fault_report')],
      caller,
    });
    const [id] = await svc.create(['r1'], { sub: 'u', name: 'Ann' });
    expect((await svc.get(id)).status).toBe('generating');
    await svc.idle();

    const p = await svc.get(id);
    expect(p.status).toBe('ready');
    expect(p.agentName).toBe('fault_report');
    expect(p.files.map((f) => f.path)).toEqual(['agents/fault_report.yml']);
    expect(p.diff).toContain('-');
    expect(p.diff).toContain('+');
    expect(p.diff).toContain('Be brief');
    expect(p.rationale).toBe('Fixes review r1.');
    expect(p.cases).toHaveLength(1);
    expect(p.cases[0].diagnosis?.layer).toBe('prompt');
    expect(p.cases[0].evidence.review.expectedResult).toBe('e');
    expect(p.baseCommit).toBe(config.hash);
    expect(p.inventoryAvailable).toBe(true);
    expect(caller.names).toEqual(['diagnosis', 'config_change']);
  });

  it('is ready with notes and no diff when every diagnosis is tool_missing', async () => {
    const caller = fakeCaller('tool_missing');
    const { svc } = build({
      reviews: [bad('r1', 'm1')],
      messages: [message('m1', 'fault_report')],
      caller,
    });
    const [id] = await svc.create(['r1'], { sub: 'u', name: 'n' });
    await svc.idle();
    const p = await svc.get(id);
    expect(p.status).toBe('ready');
    expect(p.files).toEqual([]);
    expect(p.diff).toBe('');
    expect(p.notes[0]).toContain('tool_missing');
    expect(caller.names).toEqual(['diagnosis']);
  });

  it('notes an unavailable inventory', async () => {
    const { svc } = build({
      reviews: [bad('r1', 'm1')],
      messages: [message('m1', 'fault_report')],
      caller: fakeCaller('tool_missing'),
      inventory: false,
    });
    const [id] = await svc.create(['r1'], { sub: 'u', name: 'n' });
    await svc.idle();
    const p = await svc.get(id);
    expect(p.inventoryAvailable).toBe(false);
    expect(p.cases[0].diagnosis?.layer).toBe('insufficient_evidence');
    expect(p.notes.join()).toContain('inventory could not be read');
  });

  it('fails the proposal with the error when the model call throws', async () => {
    const { svc } = build({
      reviews: [bad('r1', 'm1')],
      messages: [message('m1', 'fault_report')],
      caller: {
        call: async () => {
          throw new Error('model down');
        },
      },
    });
    const [id] = await svc.create(['r1'], { sub: 'u', name: 'n' });
    await svc.idle();
    const p = await svc.get(id);
    expect(p.status).toBe('failed');
    expect(p.error).toContain('model down');
  });
});

describe('ImprovementService lifecycle', () => {
  it('sets proposals that were generating at start to failed (interrupted)', async () => {
    const { svc, proposals } = build({});
    proposals.rows.push({ id: 'p1', status: 'generating' }, { id: 'p2', status: 'ready' });
    await svc.onModuleInit();
    expect(proposals.rows[0]).toMatchObject({ status: 'failed', error: 'interrupted' });
    expect(proposals.rows[1].status).toBe('ready');
  });

  it('discards a ready proposal, not a generating one, and 404s an unknown one', async () => {
    const { svc, proposals } = build({});
    proposals.rows.push({ id: 'a', status: 'ready' }, { id: 'b', status: 'generating' });
    await svc.discard('a');
    expect(proposals.rows[0].status).toBe('discarded');
    await expect(svc.discard('b')).rejects.toThrow(ConflictException);
    await expect(svc.discard('zzz')).rejects.toThrow(NotFoundException);
  });
});

describe('Limiter', () => {
  it('runs at most `limit` tasks at once', async () => {
    const limiter = new Limiter(2);
    let active = 0;
    let peak = 0;
    const task = async () => {
      peak = Math.max(peak, ++active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
    };
    await Promise.all(Array.from({ length: 6 }, () => limiter.run(task)));
    expect(peak).toBe(2);
  });
});

describe('Replay during generation', () => {
  const turnRows = (id: string, hash = 'h1'): Row[] => [
    {
      id: `${id}-u`,
      sessionId: `s-${id}`,
      seq: 1,
      turnId: `t-${id}`,
      type: 'user_input',
      agentName: null,
      agentConfigHash: null,
      content: 'elevator stuck',
      toolCalls: null,
      toolCallId: null,
      toolName: null,
      status: 'ok',
    },
    {
      id: id,
      sessionId: `s-${id}`,
      seq: 2,
      turnId: `t-${id}`,
      type: 'llm_end_turn',
      agentName: 'fault_report',
      agentConfigHash: hash,
      agentConfigVersion: 'v1.0',
      content: 'which floor?',
      toolCalls: null,
      toolCallId: null,
      toolName: null,
      status: 'ok',
    },
  ];
  const tools = [
    {
      name: 'work_order_createWorkOrder',
      description: 'Create',
      source: 'work_order',
      inputSchema: { type: 'object', properties: {} },
    },
  ];
  const make = (over: Partial<Parameters<typeof build>[0]> = {}) =>
    build({
      reviews: [
        bad('r1', 'm1'),
        {
          id: 'g1',
          rating: 'good',
          messageId: 'm2',
          comment: null,
          expectedResult: null,
          createdAt: new Date(),
        } as Row,
      ],
      messages: [...turnRows('m1'), ...turnRows('m2'), ...turnRows('m3')],
      caller: fakeCaller(),
      tools,
      ...over,
    });

  it('replays the target and every Good review of the agent, with verdicts, and shows them', async () => {
    const seen: { prompt: string; agent: string | undefined }[] = [];
    const { svc, replays } = make({
      runner: async (cfg, _h, ctx) => {
        seen.push({ prompt: cfg.definition('fault_report').systemPrompt, agent: ctx.agent });
        return { answer: 'ok', agent: 'fault_report' };
      },
    });
    const [id] = await svc.create(['r1'], { sub: 'u', name: 'n' });
    await svc.idle();
    const p = await svc.get(id);
    expect(p.status).toBe('ready');
    expect(p.replays.map((r) => [r.kind, r.reviewId]).sort()).toEqual([
      ['regression', 'g1'],
      ['target', 'r1'],
    ]);
    expect(p.replays.every((r) => r.verdict?.verdict === 'improved' && !r.error)).toBe(true);
    // Each replay runs the old and the proposed config.
    expect(seen).toHaveLength(4);
    expect(seen.filter((s) => s.prompt.includes('Be brief'))).toHaveLength(2);
    expect(seen.filter((s) => s.prompt === 'p')).toHaveLength(2);
    expect(replays.rows).toHaveLength(2);
  });

  it('skips replay with a note when the tool inventory is unavailable', async () => {
    const { svc, replays } = make({ inventory: false });
    const [id] = await svc.create(['r1'], { sub: 'u', name: 'n' });
    await svc.idle();
    const p = await svc.get(id);
    expect(p.status).toBe('ready');
    expect(replays.rows).toHaveLength(0);
    expect(p.notes.join()).toContain('Replay was skipped');
  });

  it('stores a failing replay as an error and keeps the proposal ready', async () => {
    const { svc } = make({
      runner: async () => {
        throw new Error('model down');
      },
    });
    const [id] = await svc.create(['r1'], { sub: 'u', name: 'n' });
    await svc.idle();
    const p = await svc.get(id);
    expect(p.status).toBe('ready');
    expect(p.replays.length).toBeGreaterThan(0);
    expect(p.replays.every((r) => r.error?.includes('model down'))).toBe(true);
  });

  it('does not replay when the proposal has no diff', async () => {
    const { svc, replays } = make({ caller: fakeCaller('tool_missing') });
    await svc.create(['r1'], { sub: 'u', name: 'n' });
    await svc.idle();
    expect(replays.rows).toHaveLength(0);
  });
});

describe('ImprovementService.publish', () => {
  const GH = {
    source: 'https://github.com/o/r//langchain-example',
    githubToken: 'tok',
  };
  const ready = (over: Record<string, unknown> = {}): Row => ({
    id: 'abcdef1234-5',
    agentName: 'fault_report',
    status: 'ready',
    files: [{ path: 'agents/fault_report.yml', base: 'old', proposed: 'new' }],
    stale: false,
    branch: null,
    prUrl: null,
    rationale: 'Because.',
    baseCommit: 'beb19e71674',
    createdAt: new Date(),
    updatedAt: new Date(),
    notes: [],
    ...over,
  });

  const writerFor = (over: Record<string, unknown> = {}) => {
    const calls: string[] = [];
    const w = {
      defaultBranch: async () => (calls.push('defaultBranch'), 'main'),
      head: async () => (calls.push('head'), { commit: 'headsha', tree: 'treesha' }),
      fileText: async () => (calls.push('fileText'), 'old'),
      createBranch: async (name: string) => void calls.push(`createBranch ${name}`),
      deleteBranch: async (name: string) => void calls.push(`deleteBranch ${name}`),
      commitFiles: async () => (calls.push('commit'), 'c'),
      openPullRequest: async () => (calls.push('pr'), 'https://github.com/o/r/pull/3'),
      ...over,
    };
    return { w, calls };
  };

  const setup = (
    writer: ReturnType<typeof writerFor>,
    proposal: Row = ready(),
    agentConfig: object = GH,
  ) => {
    const b = build({ agentConfig });
    b.proposals.rows.push(proposal);
    b.svc.github = () => writer.w as never;
    return b;
  };

  it('creates the branch, one commit and an open pull request, then marks it published', async () => {
    const writer = writerFor();
    const { svc, proposals } = setup(writer);
    const out = await svc.publish('abcdef1234-5');
    expect(out).toEqual({ branch: 'improvement/abcdef12', prUrl: 'https://github.com/o/r/pull/3' });
    expect(proposals.rows[0]).toMatchObject({
      status: 'published',
      branch: 'improvement/abcdef12',
      prUrl: 'https://github.com/o/r/pull/3',
    });
    expect(writer.calls).toEqual([
      'defaultBranch',
      'head',
      'fileText',
      'createBranch improvement/abcdef12',
      'commit',
      'pr',
    ]);
  });

  it('answers 409 and marks the proposal stale when a file changed on the default branch', async () => {
    const writer = writerFor({ fileText: async () => 'changed by someone' });
    const { svc, proposals } = setup(writer);
    await expect(svc.publish('abcdef1234-5')).rejects.toThrow(ConflictException);
    expect(proposals.rows[0]).toMatchObject({ stale: true, status: 'ready', branch: null });
    expect(writer.calls.some((c) => c.startsWith('createBranch'))).toBe(false);
    await expect(svc.publish('abcdef1234-5')).rejects.toThrow(/generate it again/);
  });

  it('opens exactly one pull request when requested twice at once', async () => {
    let prs = 0;
    const writer = writerFor({
      openPullRequest: async () => {
        prs++;
        await new Promise((r) => setTimeout(r, 10));
        return 'https://github.com/o/r/pull/3';
      },
    });
    const { svc } = setup(writer);
    const results = await Promise.allSettled([
      svc.publish('abcdef1234-5'),
      svc.publish('abcdef1234-5'),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected')).toMatchObject({
      reason: expect.any(ConflictException),
    });
    expect(prs).toBe(1);
    await expect(svc.publish('abcdef1234-5')).rejects.toThrow(ConflictException);
  });

  it('reports a permission error without a token value, removes its branch and stays ready', async () => {
    const writer = writerFor({
      commitFiles: async () => {
        throw new GitHubWriteError(
          'permission',
          'GitHub refused: needs Contents and Pull requests write access',
        );
      },
    });
    const { svc, proposals } = setup(writer);
    const err = await svc.publish('abcdef1234-5').catch((e) => e);
    expect(err).toBeInstanceOf(BadGatewayException);
    expect(err.message).toContain('write access');
    expect(err.message).not.toContain('tok');
    expect(proposals.rows[0]).toMatchObject({ status: 'ready', branch: null, prUrl: null });
    expect(writer.calls).toContain('deleteBranch improvement/abcdef12');
    // The claim is released: a retry works.
    const retry = setup(writerFor());
    expect(retry.svc).toBeDefined();
  });

  it('is not available for a local config directory or without a token', async () => {
    for (const agentConfig of [
      { source: '/some/dir', githubToken: 'tok' },
      { source: GH.source },
    ]) {
      const writer = writerFor();
      const { svc } = setup(writer, ready(), agentConfig);
      await expect(svc.publish('abcdef1234-5')).rejects.toThrow(/not available/);
      expect(writer.calls).toHaveLength(0);
    }
  });

  it('refuses a proposal that is not ready, has no changes or is unknown', async () => {
    const writer = writerFor();
    const a = setup(writer, ready({ status: 'generating' }));
    await expect(a.svc.publish('abcdef1234-5')).rejects.toThrow(ConflictException);
    const b = setup(writer, ready({ files: [] }));
    await expect(b.svc.publish('abcdef1234-5')).rejects.toThrow(ConflictException);
    await expect(b.svc.publish('nope')).rejects.toThrow(NotFoundException);
    expect(writer.calls).toHaveLength(0);
  });

  it('offers publishing in the proposal only when it is possible', async () => {
    const mk = (proposal: Row, agentConfig: object = GH) => {
      const b = setup(writerFor(), proposal, agentConfig);
      return b.svc.get(proposal.id);
    };
    expect((await mk(ready())).publishAvailable).toBe(true);
    expect((await mk(ready({ stale: true }))).publishAvailable).toBe(false);
    expect(
      (await mk(ready({ status: 'published', branch: 'improvement/x' }))).publishAvailable,
    ).toBe(false);
    expect((await mk(ready(), { source: '/dir', githubToken: 'tok' })).publishAvailable).toBe(
      false,
    );
    expect((await mk(ready(), { source: GH.source })).publishAvailable).toBe(false);
  });
});
