import {
  canonicalJson,
  createRecordedMcp,
  recordedResults,
  UNRECORDED_RESULT,
} from './recorded-mcp';

const inventory = [
  {
    name: 'work_order_getWorkOrder',
    description: 'Read a work order',
    source: 'work_order',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    name: 'work_order_createWorkOrder',
    description: 'Create a work order',
    source: 'work_order',
    inputSchema: { type: 'object', properties: { title: { type: 'string' } } },
  },
  { name: 'renameSession', description: '', source: 'local' },
];

const events = [
  {
    type: 'llm_tool_use',
    toolCalls: [{ id: 'c1', name: 'work_order_getWorkOrder', args: { id: 'WO-1', x: 1 } }],
    toolCallId: null,
    toolName: null,
    content: '',
    status: 'ok' as const,
  },
  {
    type: 'agent_tool_result',
    toolCalls: null,
    toolCallId: 'c1',
    toolName: 'work_order_getWorkOrder',
    content: '{"status":"open"}',
    status: 'ok' as const,
  },
];

const call = (rec: ReturnType<typeof createRecordedMcp>, name: string, args: unknown) =>
  rec.connection.tools.find((t) => t.name === name)!.invoke(args as never);

describe('canonicalJson', () => {
  it('ignores key order', () => {
    expect(canonicalJson({ a: 1, b: { d: 1, c: 2 } })).toBe(
      canonicalJson({ b: { c: 2, d: 1 }, a: 1 }),
    );
  });
});

describe('recordedResults', () => {
  it('pairs results with the arguments of their calls', () => {
    expect(recordedResults(events)).toEqual([
      {
        toolName: 'work_order_getWorkOrder',
        args: { id: 'WO-1', x: 1 },
        content: '{"status":"open"}',
        status: 'ok',
      },
    ]);
  });
});

describe('createRecordedMcp', () => {
  it('exposes the MCP tools of the inventory grouped by server, not local ones', () => {
    const rec = createRecordedMcp(inventory, []);
    expect(rec.connection.tools.map((t) => t.name)).toEqual([
      'work_order_getWorkOrder',
      'work_order_createWorkOrder',
    ]);
    expect(Object.keys(rec.connection.toolsByServer)).toEqual(['work_order']);
  });

  it('returns the recorded result for a matching call, once', async () => {
    const rec = createRecordedMcp(inventory, recordedResults(events));
    expect(await call(rec, 'work_order_getWorkOrder', { x: 1, id: 'WO-1' })).toBe(
      '{"status":"open"}',
    );
    expect(await call(rec, 'work_order_getWorkOrder', { id: 'WO-1', x: 1 })).toBe(
      UNRECORDED_RESULT,
    );
    expect(rec.calls.map((c) => c.unrecorded)).toEqual([false, true]);
  });

  it('does not execute a call without a recorded result and flags it', async () => {
    const rec = createRecordedMcp(inventory, recordedResults(events));
    const out = await call(rec, 'work_order_createWorkOrder', { title: 'Elevator stuck' });
    expect(out).toBe(UNRECORDED_RESULT);
    expect(rec.calls).toEqual([
      { name: 'work_order_createWorkOrder', args: { title: 'Elevator stuck' }, unrecorded: true },
    ]);
  });

  it('treats the same tool with other arguments as unrecorded', async () => {
    const rec = createRecordedMcp(inventory, recordedResults(events));
    await call(rec, 'work_order_getWorkOrder', { id: 'WO-2', x: 1 });
    expect(rec.calls[0].unrecorded).toBe(true);
  });

  it('closing does nothing and opens no connection', async () => {
    await expect(createRecordedMcp(inventory, []).connection.close()).resolves.toBeUndefined();
  });
});
