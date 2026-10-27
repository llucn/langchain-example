import type { StructuredToolInterface } from '@langchain/core/tools';
import type { Repository } from 'typeorm';
import type { ChatSession } from '../database/entities/chat-session.entity';
import type { User } from '../database/entities/user.entity';

/**
 * How tools get what the LLM must not supply (ids, repositories, ...):
 * - `AgentRunContext`: per-run values, passed by the caller to `AgentService.run`.
 * - `AgentToolDeps`: shared handles, owned by `AgentService` (injected by Nest).
 * Tools are factories `(ctx) => tool`, registered in `tools/index.ts`; the tool's own schema
 * only contains the arguments the LLM is meant to choose.
 */
export interface AgentRunContext {
  sessionId: string;
  /** The visitor's JWT, forwarded to the MCP servers; absent when auth is disabled. */
  idToken?: string;
  /** The session's active agent (see agent.config.ts); unknown names start at the selector. */
  agent?: string;
}

export interface AgentToolDeps {
  users: Repository<User>;
  sessions: Repository<ChatSession>;
}

export type AgentToolContext = AgentRunContext & AgentToolDeps;

export type AgentToolFactory = (ctx: AgentToolContext) => StructuredToolInterface;
