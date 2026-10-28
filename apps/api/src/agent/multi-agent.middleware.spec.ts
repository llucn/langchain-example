import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { createAgent, fakeModel } from 'langchain';
import { AGENTS, resolveAgent, type AgentName } from './agent.config';
import { composePrompt, createMultiAgentMiddleware, visibleTools } from './multi-agent.middleware';
import { createSelectAgentTool } from './tools/select-agent.tool';
import { createRenameSessionTool } from './tools/rename-session.tool';

const ctx = { sessionId: 's', users: {}, sessions: {} } as never;
const select = createSelectAgentTool(ctx);
const rename = createRenameSessionTool(ctx);
const mcp = (server: string) => ({ name: `${server}_get` }) as never;

describe('agent registry', () => {
  it('defines the four agents and keeps connection data out of them', () => {
    expect(Object.keys(AGENTS)).toEqual([
      'selector',
      'fault_report',
      'work_order_inquiry',
      'other',
    ]);
    for (const def of Object.values(AGENTS)) {
      expect(Object.keys(def)).not.toEqual(expect.arrayContaining(['apiKey', 'apiUrl', 'url']));
    }
  });

  it('only references known local tools and MCP servers', () => {
    const local = new Set([select.name, rename.name]);
    const servers = new Set(['user', 'asset', 'location', 'work_order']);
    for (const def of Object.values(AGENTS)) {
      for (const t of def.tools) {
        expect(t.type === 'local' ? local.has(t.name) : servers.has(t.server)).toBe(true);
      }
    }
  });

  it('falls back to the selector for unknown names', () => {
    expect(resolveAgent('billing')).toBe('selector');
    expect(resolveAgent(undefined)).toBe('selector');
    expect(resolveAgent('other')).toBe('other');
  });
});

describe('visibleTools', () => {
  const byServer = { user: [mcp('user')], asset: [mcp('asset')], work_order: [mcp('work_order')] };
  const names = (agent: AgentName) =>
    visibleTools(AGENTS[agent].tools, [select, rename], byServer).map((t) => t.name);

  it('gives each agent only what its definition lists', () => {
    expect(names('selector')).toEqual(['selectAgent']);
    expect(names('work_order_inquiry')).toEqual(['renameSession', 'user_get', 'work_order_get']);
    expect(names('other')).toEqual(['renameSession']);
  });
});

describe('composePrompt', () => {
  it('tells the selector which turn it is and forces routing on the last one', () => {
    const turns = (n: number) => Array.from({ length: n }, () => ({ type: 'human' }));
    expect(composePrompt('selector', turns(2), '')).toContain('user turn 2 of at most 5');
    expect(composePrompt('selector', turns(2), '')).not.toContain('call `selectAgent` now');
    expect(composePrompt('selector', turns(5), '')).toContain('call `selectAgent` now');
  });

  it('gives the routing summary to downstream agents', () => {
    expect(composePrompt('fault_report', [], 'gateway 500s')).toContain('gateway 500s');
  });

  it('asks for the session title only in the hand-over run', () => {
    expect(composePrompt('fault_report', [], 'x')).toContain('first reply after the hand-over');
    expect(composePrompt('fault_report', [], '')).not.toContain('renameSession` with');
  });
});

describe('switching inside one run', () => {
  const build = (
    selectorModel: ReturnType<typeof fakeModel>,
    faultModel: ReturnType<typeof fakeModel>,
    otherModel: ReturnType<typeof fakeModel> = fakeModel(),
  ) => {
    const models: Record<string, ReturnType<typeof fakeModel>> = {
      selector: selectorModel,
      fault_report: faultModel,
      other: otherModel,
    };
    const tools = [select, rename];
    return createAgent({
      model: selectorModel,
      tools,
      middleware: [
        createMultiAgentMiddleware({
          modelFor: (a) => models[a],
          localTools: tools,
          mcpByServer: {},
        }),
      ],
    });
  };

  const sel = (confidence: number, agentName = 'fault_report') =>
    fakeModel().respondWithTools([
      { name: 'selectAgent', args: { agentName, confidence, summary: 'gateway 500s' }, id: 'c1' },
    ]);

  it('routes, then answers with the downstream agent in the same run', async () => {
    const selector = sel(0.97);
    const fault = fakeModel().respond(new AIMessage('Which asset is affected?'));
    const out = await build(selector, fault).invoke({
      messages: [new HumanMessage('Gateway throws 500s')],
      currentAgent: 'selector',
    });
    expect(out.currentAgent).toBe('fault_report');
    expect(out.routingSummary).toBe('gateway 500s');
    expect(out.messages.at(-1)?.content).toBe('Which asset is affected?');
    const system = JSON.stringify(fault.calls[0].messages[0].content);
    expect(system).toContain('fault-report agent');
    expect(system).toContain('gateway 500s');
    expect(selector.calls).toHaveLength(1);
  });

  it('stays at the selector on low confidence before the last turn', async () => {
    const selector = sel(0.4).respond(new AIMessage('Is it a fault or a work order?'));
    const out = await build(selector, fakeModel()).invoke({
      messages: [new HumanMessage('I have a problem')],
      currentAgent: 'selector',
    });
    expect(out.currentAgent).toBe('selector');
    expect(out.messages.at(-1)?.content).toBe('Is it a fault or a work order?');
  });

  it('routes on the last selector turn even with low confidence', async () => {
    const selector = sel(0.3, 'other');
    const other = fakeModel().respond(new AIMessage('How can I help?'));
    const turns = Array.from({ length: 5 }, (_, i) => new HumanMessage(`turn ${i}`));
    const out = await build(selector, fakeModel(), other).invoke({
      messages: turns,
      currentAgent: 'selector',
    });
    expect(out.currentAgent).toBe('other');
  });

  it('rejects an unknown agent name', async () => {
    const selector = sel(0.9, 'billing').respond(new AIMessage('Sorry'));
    const out = await build(selector, fakeModel()).invoke({
      messages: [new HumanMessage('hi')],
      currentAgent: 'selector',
    });
    expect(out.currentAgent).toBe('selector');
  });

  it('starts at the stored agent without consulting the selector', async () => {
    const selector = fakeModel();
    const fault = fakeModel().respond(new AIMessage('Noted.'));
    const out = await build(selector, fault).invoke({
      messages: [new HumanMessage('It is the main one')],
      currentAgent: 'fault_report',
    });
    expect(out.currentAgent).toBe('fault_report');
    expect(selector.calls).toHaveLength(0);
    expect(fault.calls).toHaveLength(1);
  });
});
