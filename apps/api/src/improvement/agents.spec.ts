import type { CaseEvidence } from '@app/shared';
import { LOCAL_TOOL_NAMES } from '../agent/tools';
import { SAMPLE_CONFIG_DIR } from '../agent-config/sample-config';
import { readLocalConfig } from '../agent-config/source';
import { checkConfigChange } from './config-change.checker';
import { diagnoseCase } from './diagnosis.agent';
import type { StructuredCaller } from './evolution.model';
import { MAX_RETRIES, proposeChange } from './proposal.agent';

const evidence: CaseEvidence = {
  reviewedSeq: 4,
  agentName: 'fault_report',
  configHash: 'h',
  configVersion: 'v1.0',
  definition: { systemPrompt: 'You cannot create work orders.' },
  settings: null,
  review: {
    tags: ['too_verbose'],
    comment: 'create it',
    expectedResult: 'create',
    reviewerName: null,
  },
  history: [],
  turn: [],
};

const caller = (answers: unknown[]): StructuredCaller & { calls: { user: string }[] } => {
  const calls: { user: string }[] = [];
  return {
    calls,
    call: async (opts) => {
      calls.push({ user: opts.user });
      return opts.schema.parse(answers[Math.min(calls.length - 1, answers.length - 1)]) as never;
    },
  };
};

const diag = (layer: string) => ({
  layer,
  rootCause: 'because',
  evidence: ['#4'],
  confidence: 0.9,
  suggestedAction: 'fix',
});

describe('diagnoseCase', () => {
  it('returns the model diagnosis', async () => {
    const c = caller([diag('prompt')]);
    const d = await diagnoseCase(c, { evidence, tools: [], insufficient: false });
    expect(d.layer).toBe('prompt');
    expect(c.calls[0].user).toContain('You cannot create work orders.');
  });

  it('needs no model call without a config snapshot', async () => {
    const c = caller([diag('prompt')]);
    const d = await diagnoseCase(c, { evidence, tools: [], insufficient: true });
    expect(d.layer).toBe('insufficient_evidence');
    expect(c.calls).toHaveLength(0);
  });

  it.each(['tool_missing', 'tool_config'])(
    'turns %s into insufficient evidence without a tool inventory',
    async (layer) => {
      const d = await diagnoseCase(caller([diag(layer)]), {
        evidence,
        tools: null,
        insufficient: false,
      });
      expect(d.layer).toBe('insufficient_evidence');
      expect(d.rootCause).toContain('inventory unavailable');
    },
  );

  it('keeps a tool verdict when the inventory exists', async () => {
    const d = await diagnoseCase(caller([diag('tool_missing')]), {
      evidence,
      tools: [],
      insufficient: false,
    });
    expect(d.layer).toBe('tool_missing');
  });
});

describe('proposeChange', () => {
  const base = () => structuredClone(readLocalConfig(SAMPLE_CONFIG_DIR).files);
  const identity = { hash: 'h', version: 'v', source: 's' };
  const input = (c: StructuredCaller) => {
    const b = base();
    return {
      c,
      args: {
        agentName: 'fault_report',
        cases: [{ reviewId: 'r1', diagnosis: diag('prompt') as never, evidence }],
        base: b,
        tools: [],
        check: (proposed: typeof b) =>
          checkConfigChange({
            base: b,
            proposed,
            allowedAgents: new Set(['fault_report']),
            allowSettings: false,
            knownLocalTools: LOCAL_TOOL_NAMES,
            identity,
          }),
      },
    };
  };
  const edited = (patch: (s: string) => string) => patch(base().agents.fault_report);

  it('accepts a prompt-only change', async () => {
    const text = edited((s) => s.replace('Answer concisely', 'Be brief'));
    const { c, args } = input(
      caller([{ files: [{ path: 'agents/fault_report.yml', content: text }], rationale: 'r1' }]),
    );
    const out = await proposeChange(c, args);
    expect(out.proposed.agents.fault_report).toBe(text);
    expect(out.rationale).toBe('r1');
  });

  it('feeds the problems back and accepts the corrected answer', async () => {
    const bad = edited((s) => s.replace('model: ${env.AGENT_MODEL}', 'model: x'));
    const good = edited((s) => s.replace('Answer concisely', 'Be brief'));
    const c = caller([
      { files: [{ path: 'agents/fault_report.yml', content: bad }], rationale: 'a' },
      { files: [{ path: 'agents/fault_report.yml', content: good }], rationale: 'b' },
    ]);
    const out = await proposeChange(c, input(c).args);
    expect(out.proposed.agents.fault_report).toBe(good);
    expect(c.calls).toHaveLength(2);
    expect(c.calls[1].user).toContain('`model` must not change');
  });

  it('throws after the retries when the change stays outside the allowlist', async () => {
    const bad = edited((s) => s.replace('model: ${env.AGENT_MODEL}', 'model: x'));
    const c = caller([
      { files: [{ path: 'agents/fault_report.yml', content: bad }], rationale: 'a' },
    ]);
    await expect(proposeChange(c, input(c).args)).rejects.toThrow('rejected');
    expect(c.calls).toHaveLength(MAX_RETRIES + 1);
  });

  it('rejects a path that is not a config file', async () => {
    const c = caller([{ files: [{ path: '../../etc/passwd', content: 'x' }], rationale: 'a' }]);
    await expect(proposeChange(c, input(c).args)).rejects.toThrow('not an existing config file');
  });

  it('returns the base unchanged when the model proposes nothing', async () => {
    const c = caller([{ files: [], rationale: 'nothing justified' }]);
    const { args } = input(c);
    const out = await proposeChange(c, args);
    expect(out.proposed).toBe(args.base);
  });
});
