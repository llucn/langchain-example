import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { sampleAgentConfig } from '../agent-config/sample-config';
import { loadToolInventory } from './tool-inventory';

const createWorkOrder = tool(async () => 'ok', {
  name: 'work_order_createWorkOrder',
  description: 'Create a work order',
  schema: z.object({ title: z.string() }),
});

describe('loadToolInventory', () => {
  const config = sampleAgentConfig();
  const conn = (toolsByServer: Record<string, unknown[]>, close = jest.fn()) => ({
    tools: Object.values(toolsByServer).flat() as never[],
    toolsByServer: toolsByServer as never,
    close,
  });

  it('lists MCP tools per agent with their schema and closes the connection', async () => {
    const close = jest.fn();
    const inv = await loadToolInventory(config, 'tok', async () =>
      conn({ work_order: [createWorkOrder], user: [], asset: [], location: [] }, close),
    );
    expect(inv.available).toBe(true);
    const names = inv.byAgent.fault_report.map((t) => t.name);
    expect(names).toContain('work_order_createWorkOrder');
    expect(names).toContain('renameSession');
    const info = inv.byAgent.fault_report.find((t) => t.name === 'work_order_createWorkOrder');
    expect(info?.description).toBe('Create a work order');
    expect(JSON.stringify(info?.inputSchema)).toContain('title');
    expect(close).toHaveBeenCalled();
  });

  it('is unavailable when no server returned a tool (no token, unreachable)', async () => {
    const inv = await loadToolInventory(config, undefined, async () =>
      conn({ work_order: [], user: [], asset: [], location: [] }),
    );
    expect(inv.available).toBe(false);
  });

  it('is unavailable when connecting throws', async () => {
    const inv = await loadToolInventory(config, 'tok', async () => {
      throw new Error('down');
    });
    expect(inv.available).toBe(false);
  });
});
