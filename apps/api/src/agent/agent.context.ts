import type { StructuredToolInterface } from '@langchain/core/tools';
import type { Repository } from 'typeorm';
import type { ChatSession } from '../database/entities/chat-session.entity';
import type { User } from '../database/entities/user.entity';
import type { AgentConfigService } from '../agent-config/agent-config.service';
import type { MemoryService } from '../memory/memory.service';
import type { PromptMemory } from './memory-prompt';
import type { AgentRunLog } from './agent.log';
import type { McpConnection } from './mcp/mcp.client';

/**
 * How tools get what the LLM must not supply (ids, repositories, ...):
 * - `AgentRunContext`: per-run values, passed by the caller to `AgentService.run`.
 * - `AgentToolDeps`: shared handles, owned by `AgentService` (injected by Nest).
 * Tools are factories `(ctx) => tool`, registered in `tools/index.ts`; the tool's own schema
 * only contains the arguments the LLM is meant to choose.
 */
export interface AgentRunContext {
  sessionId: string;
  /** The visitor's OIDC subject (owner of their memories); absent when auth is disabled. */
  ownerSub?: string | null;
  /**
   * Memories to put in the prompt instead of reading the owner's (replay passes the recorded ones).
   */
  memories?: PromptMemory[];
  /** The visitor's JWT, forwarded to the MCP servers; absent when auth is disabled. */
  idToken?: string;
  /** The session's active agent (see the Agent Config); unknown names start at the selector. */
  agent?: string;
  /** Receives the run's model replies and tool results for the chat log. */
  log?: AgentRunLog;
  /**
   * Tools to use instead of connecting to the config's MCP servers (replay passes recorded ones).
   * The caller owns the connection; the run does not close it.
   */
  mcp?: McpConnection;
  /** Called after `renameSession` stored a new name, so the caller can tell the client at once. */
  onSessionRenamed?: () => void | Promise<void>;
}

export interface AgentToolDeps {
  users: Repository<User>;
  sessions: Repository<ChatSession>;
  config: AgentConfigService;
  memoryStore: MemoryService;
}

export type AgentToolContext = AgentRunContext & AgentToolDeps;

export type AgentToolFactory = (ctx: AgentToolContext) => StructuredToolInterface;
