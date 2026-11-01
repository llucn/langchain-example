import { AIMessage, ToolMessage } from '@langchain/core/messages';
import { AgentConfigService } from '../agent-config/agent-config.service';
import { sampleAgentConfig } from '../agent-config/sample-config';
import { acquireMcp, AgentService, foldStep, modelConnection, trimHistory } from './agent.service';

describe('trimHistory', () => {
  it('keeps only the most recent messages', () => {
    const max = sampleAgentConfig().settings.maxContextMessages;
    const h = Array.from({ length: max + 5 }, (_, i) => ({
      role: 'user' as const,
      content: String(i),
    }));
    const t = trimHistory(h, max);
    expect(t).toHaveLength(max);
    expect(t[t.length - 1].content).toBe(String(h.length - 1));
  });
});

describe('AgentService config', () => {
  const svc = (model: { baseUrl?: string; apiKey?: string }, config = sampleAgentConfig()) =>
    new AgentService({ model } as never, {} as never, {} as never, config);

  it('names the missing variable', async () => {
    await expect(svc({ apiKey: 'k' }).run([], { sessionId: 's' }, () => {})).rejects.toThrow(
      'MODEL_BASE_URL',
    );
    await expect(
      svc({ baseUrl: 'http://x' }).run([], { sessionId: 's' }, () => {}),
    ).rejects.toThrow('MODEL_API_KEY');
  });
});

describe('modelConnection', () => {
  const env = { model: { baseUrl: 'http://env', apiKey: 'env-key' } } as never;

  it('uses the environment without a model block', () => {
    expect(modelConnection(sampleAgentConfig(), env)).toEqual({
      baseUrl: 'http://env',
      apiKey: 'env-key',
    });
  });

  it('lets the config model block replace the environment', () => {
    const config = new AgentConfigService({
      ...sampleAgentConfig().config,
      model: { baseUrl: 'http://cfg', apiKey: 'cfg-key' },
    });
    expect(modelConnection(config, env)).toEqual({ baseUrl: 'http://cfg', apiKey: 'cfg-key' });
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

describe('acquireMcp', () => {
  const conn = () => ({ tools: [], toolsByServer: {}, close: jest.fn(async () => undefined) });

  it('uses an injected connection, never connects and never closes it', async () => {
    const injected = conn();
    const connect = jest.fn();
    const { mcp, release } = await acquireMcp({ mcp: injected }, { a: 'http://x' }, connect);
    await release();
    expect(mcp).toBe(injected);
    expect(connect).not.toHaveBeenCalled();
    expect(injected.close).not.toHaveBeenCalled();
  });

  it('connects with the visitor token and closes what it opened', async () => {
    const opened = conn();
    const connect = jest.fn(async () => opened);
    const { mcp, release } = await acquireMcp({ idToken: 'tok' }, { a: 'http://x' }, connect);
    expect(connect).toHaveBeenCalledWith({ a: 'http://x' }, 'tok');
    await release();
    expect(mcp).toBe(opened);
    expect(opened.close).toHaveBeenCalledTimes(1);
  });
});
