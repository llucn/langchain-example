import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { sampleAgentConfig } from '../agent-config/sample-config';
import { SAMPLE_CONFIG_DIR } from '../agent-config/sample-config';
import { readLocalConfig } from '../agent-config/source';
import type { StructuredCaller } from './evolution.model';
import { ImprovementService, Limiter } from './improvement.service';

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
      let params: { id: string; from: string[] };
      const qb = {
        update: () => qb,
        set: () => qb,
        where: (_: string, p: typeof params) => ((params = p), qb),
        execute: async () => {
          const r = rows.find(
            (x) => x.id === params.id && params.from.includes(x.status as string),
          );
          if (r) (r as Row).status = 'discarded';
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
}) => {
  const proposals = repo<Row>();
  const cases = repo<Row>();
  const svc = new ImprovementService(
    { evolution: { model: 'm', maxTokens: 1 }, agentConfig: {} } as never,
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
  );
  const files = readLocalConfig(SAMPLE_CONFIG_DIR).files;
  svc.files = { current: async () => structuredClone(files) };
  svc.inventory = async () => ({
    available: opts.inventory ?? true,
    byAgent: { fault_report: [], work_order_inquiry: [] },
  });
  if (opts.caller) svc.caller = () => opts.caller as StructuredCaller;
  return { svc, proposals, cases };
};

const fakeCaller = (layer = 'prompt'): StructuredCaller & { names: string[] } => {
  const names: string[] = [];
  return {
    names,
    call: async (o) => {
      names.push(o.name);
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
