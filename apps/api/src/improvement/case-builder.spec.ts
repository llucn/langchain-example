import type { ChatLogMessage } from '../database/entities/chat-log-message.entity';
import type { ChatLogReview } from '../database/entities/chat-log-review.entity';
import { CaseBuilder } from './case-builder';

const msg = (seq: number, over: Partial<ChatLogMessage> = {}) =>
  ({
    id: `m${seq}`,
    sessionId: 's',
    seq,
    turnId: 't2',
    type: 'llm_end_turn',
    agentName: 'fault_report',
    agentConfigHash: 'h1',
    agentConfigVersion: 'v1.0',
    content: `event ${seq}`,
    toolName: null,
    toolCallId: null,
    toolCalls: null,
    status: 'ok',
    ...over,
  }) as ChatLogMessage;

const review = {
  id: 'r1',
  rating: 'bad',
  tags: ['too_verbose'],
  comment: 'should create the work order',
  expectedResult: 'Create work order without asset ID.',
  reviewerName: 'Ann',
} as ChatLogReview;

const make = (snapshot: object | null) => {
  const find = jest
    .fn()
    // the reviewed turn up to the reviewed event, then earlier user inputs and answers (newest first)
    .mockResolvedValueOnce([msg(3, { type: 'user_input' }), msg(4)])
    .mockResolvedValueOnce([msg(2), msg(1, { type: 'user_input' })]);
  const builder = new CaseBuilder(
    { find, findOneBy: jest.fn() } as never,
    {
      findOneBy: jest.fn().mockResolvedValue(snapshot),
    } as never,
  );
  return { builder, find };
};

describe('CaseBuilder', () => {
  it('collects the turn, history in order, the review and the config snapshot', async () => {
    const { builder } = make({
      definition: { systemPrompt: 'p' },
      settings: { settings: { recursionLimit: 10 } },
    });
    const { evidence, insufficient } = await builder.build(review, msg(4));
    expect(insufficient).toBe(false);
    expect(evidence.reviewedSeq).toBe(4);
    expect(evidence.agentName).toBe('fault_report');
    expect(evidence.definition).toEqual({ systemPrompt: 'p' });
    expect(evidence.settings).toEqual({ recursionLimit: 10 });
    expect(evidence.turn.map((e) => e.seq)).toEqual([3, 4]);
    expect(evidence.history.map((e) => e.seq)).toEqual([1, 2]);
    expect(evidence.review).toEqual({
      tags: ['too_verbose'],
      comment: 'should create the work order',
      expectedResult: 'Create work order without asset ID.',
      reviewerName: 'Ann',
    });
  });

  it('marks the case insufficient when the snapshot is missing', async () => {
    const { builder } = make(null);
    const { evidence, insufficient } = await builder.build(review, msg(4));
    expect(insufficient).toBe(true);
    expect(evidence.definition).toBeNull();
  });

  it('marks the case insufficient when the event has no config hash', async () => {
    const { builder } = make({ definition: {}, settings: {} });
    const { insufficient } = await builder.build(review, msg(4, { agentConfigHash: null }));
    expect(insufficient).toBe(true);
  });

  it('clips very long tool results', async () => {
    const find = jest
      .fn()
      .mockResolvedValueOnce([msg(4, { content: 'x'.repeat(10_000) })])
      .mockResolvedValueOnce([]);
    const builder = new CaseBuilder(
      { find } as never,
      {
        findOneBy: async () => ({ definition: {}, settings: {} }),
      } as never,
    );
    const { evidence } = await builder.build(review, msg(4));
    expect(evidence.turn[0].content.length).toBeLessThan(4100);
    expect(evidence.turn[0].content).toContain('[clipped]');
  });
});
