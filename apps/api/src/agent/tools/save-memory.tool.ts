import { tool } from '@langchain/core/tools';
import { MEMORY_MAX_LENGTH } from '@app/shared';
import { z } from 'zod';
import type { AgentToolFactory } from '../agent.context';
import { shortId } from '../../memory/memory.service';

export const createSaveMemoryTool: AgentToolFactory = ({
  memoryStore,
  config,
  ownerSub,
  sessionId,
}) =>
  tool(
    async ({ content }) => {
      if (!config.settings.memory.enabled)
        return JSON.stringify({ success: false, error: 'memory is disabled' });
      try {
        const { memory, created } = await memoryStore.save(ownerSub ?? null, content, sessionId);
        return JSON.stringify({ success: true, id: shortId(memory.id), alreadyKnown: !created });
      } catch (err) {
        return JSON.stringify({ success: false, error: (err as Error).message });
      }
    },
    {
      name: 'saveMemory',
      description:
        'Remember a durable fact or preference about this user for future conversations (for example their usual building, language or contact). Do not save one-off details, secrets or credentials.',
      schema: z.object({
        content: z
          .string()
          .describe(`One short, self-contained note, at most ${MEMORY_MAX_LENGTH} characters`),
      }),
    },
  );
