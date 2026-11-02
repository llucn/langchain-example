import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import type { AgentToolFactory } from '../agent.context';

export const createForgetMemoryTool: AgentToolFactory = ({ memoryStore, config, ownerSub }) =>
  tool(
    async ({ id }) => {
      if (!config.settings.memory.enabled)
        return JSON.stringify({ success: false, error: 'memory is disabled' });
      try {
        const memory = await memoryStore.findByRef(ownerSub ?? null, id);
        if (!memory) return JSON.stringify({ success: false, error: 'no such memory' });
        await memoryStore.remove(ownerSub ?? null, memory.id);
        return JSON.stringify({ success: true });
      } catch (err) {
        return JSON.stringify({ success: false, error: (err as Error).message });
      }
    },
    {
      name: 'forgetMemory',
      description:
        'Delete one of the remembered notes about this user when they ask you to forget it or it is wrong. Use the id shown in brackets in the remembered notes.',
      schema: z.object({ id: z.string().describe('Id of the memory, as shown in brackets') }),
    },
  );
