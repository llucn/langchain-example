import { tool } from '@langchain/core/tools';
import type { Repository } from 'typeorm';
import { z } from 'zod';
import type { ChatSession } from '../../database/entities/chat-session.entity';
import type { AgentToolFactory } from '../agent.context';

export const SESSION_NAME_MAX = 80;

/** Normalizes and stores the name; returns it, or null when it is empty. */
export async function updateSessionName(
  sessions: Repository<ChatSession>,
  sessionId: string,
  name: string,
): Promise<string | null> {
  const clean = name.replace(/\s+/g, ' ').trim().slice(0, SESSION_NAME_MAX);
  if (!clean) return null;
  await sessions.update(sessionId, { name: clean });
  return clean;
}

export const createRenameSessionTool: AgentToolFactory = ({ sessions, sessionId }) =>
  tool(
    async ({ name }) => {
      const saved = await updateSessionName(sessions, sessionId, name);
      return JSON.stringify(
        saved ? { success: true, name: saved } : { success: false, error: 'name is empty' },
      );
    },
    {
      name: 'renameSession',
      description:
        'Set a short, readable name for the current chat session, summarizing what the conversation is about.',
      schema: z.object({
        name: z.string().describe(`Session title, at most ${SESSION_NAME_MAX} characters`),
      }),
    },
  );
