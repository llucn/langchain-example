import { AIMessage, ToolMessage } from '@langchain/core/messages';
import { AGENT_MAX_CONTEXT_MESSAGES } from './agent.config';
import { AgentService, foldStep, trimHistory } from './agent.service';

describe('trimHistory', () => {
  it('keeps only the most recent messages', () => {
    const h = Array.from({ length: AGENT_MAX_CONTEXT_MESSAGES + 5 }, (_, i) => ({
      role: 'user' as const,
      content: String(i),
    }));
    const t = trimHistory(h);
    expect(t).toHaveLength(AGENT_MAX_CONTEXT_MESSAGES);
    expect(t[t.length - 1].content).toBe(String(h.length - 1));
  });
});

describe('AgentService config', () => {
  const svc = (model: { baseUrl?: string; apiKey?: string }) =>
    new AgentService({ model } as never, {} as never);

  it('names the missing variable', async () => {
    await expect(svc({ apiKey: 'k' }).run([], () => {})).rejects.toThrow('MODEL_BASE_URL');
    await expect(svc({ baseUrl: 'http://x' }).run([], () => {})).rejects.toThrow('MODEL_API_KEY');
  });
});

describe('foldStep', () => {
  it('folds reasoning and tool calls, with no answer yet', () => {
    const msg = new AIMessage({
      content: [{ type: 'thinking', thinking: ' Need weather. ' }],
      tool_calls: [{ id: '1', name: 'getWeather', args: { city: 'Paris' } }],
    });
    expect(foldStep('model', [msg])).toEqual({
      chunks: ['Need weather.', '[Tool call] getWeather {"city":"Paris"}'],
      answer: undefined,
    });
  });

  it('folds tool results', () => {
    const msg = new ToolMessage({ content: '{"t":18}', name: 'getWeather', tool_call_id: '1' });
    expect(foldStep('tools', [msg]).chunks).toEqual(['[Tool result] getWeather {"t":18}']);
  });

  it('takes the final text as the answer', () => {
    expect(foldStep('model', [new AIMessage('It is 18°C.')]).answer).toBe('It is 18°C.');
  });
});
