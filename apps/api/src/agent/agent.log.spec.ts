import { AIMessage, ToolMessage } from '@langchain/core/messages';
import { TimingHandler } from './agent.log';
import { logStep } from './agent.service';

describe('logStep', () => {
  const ctx = (timing = new TimingHandler()) => ({
    timing,
    toolSource: new Map([
      ['selectAgent', 'local'],
      ['work_order_get', 'work_order'],
    ]),
    selectorTurn: 2,
    routingSummary: 'Status of WO-1',
  });
  const sink = () => ({ onLlm: jest.fn(), onToolResult: jest.fn() });

  it('reports a model reply with tool calls and selector metadata', () => {
    const log = sink();
    const msg = new AIMessage({
      content: [{ type: 'thinking', thinking: ' route ' }],
      tool_calls: [{ id: 'c1', name: 'selectAgent', args: { agentName: 'other' } }],
    });
    logStep(log, 'model_request', 'selector', [msg], ctx());
    expect(log.onLlm).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: 'selector',
        thinking: 'route',
        toolCalls: [{ id: 'c1', name: 'selectAgent', args: { agentName: 'other' } }],
        durationMs: null,
        metadata: expect.objectContaining({ selectorTurn: 2 }),
      }),
    );
  });

  it('reports a final answer, with the routing summary for downstream agents', () => {
    const log = sink();
    logStep(log, 'model_request', 'work_order_inquiry', [new AIMessage('Done.')], ctx());
    const [e] = log.onLlm.mock.calls[0];
    expect(e.toolCalls).toEqual([]);
    expect(e.content).toBe('Done.');
    expect(e.metadata.routingSummary).toBe('Status of WO-1');
  });

  it('reports tool results with status, source and timing by tool call id', () => {
    const log = sink();
    const timing = new TimingHandler();
    timing.handleToolStart(null, '{}', 'run1', undefined, undefined, undefined, undefined, 'c9');
    timing.handleToolEnd(null, 'run1');
    const ok = new ToolMessage({ content: '{"a":1}', name: 'work_order_get', tool_call_id: 'c9' });
    const bad = new ToolMessage({
      content: 'boom',
      name: 'selectAgent',
      tool_call_id: 'c10',
      status: 'error',
    });
    logStep(log, 'tools', 'fault_report', [ok, bad], ctx(timing));
    const [first] = log.onToolResult.mock.calls[0];
    expect(first).toEqual(
      expect.objectContaining({
        toolName: 'work_order_get',
        toolCallId: 'c9',
        status: 'ok',
        metadata: { toolSource: 'work_order' },
      }),
    );
    expect(first.durationMs).toEqual(expect.any(Number));
    const [second] = log.onToolResult.mock.calls[1];
    expect(second).toEqual(expect.objectContaining({ status: 'error', durationMs: null }));
  });
});

describe('TimingHandler', () => {
  it('queues model call timings in order', () => {
    const t = new TimingHandler();
    t.handleChatModelStart({}, [], 'a');
    t.handleLLMEnd({ generations: [] }, 'a');
    t.handleChatModelStart({}, [], 'b');
    t.handleLLMError(new Error('x'), 'b');
    expect(t.takeLlm()).toBeDefined();
    expect(t.takeLlm()).toBeDefined();
    expect(t.takeLlm()).toBeUndefined();
  });
});
