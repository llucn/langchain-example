import type { StructuredToolInterface } from '@langchain/core/tools';
import { toJsonSchema } from '@langchain/core/utils/json_schema';
import { Logger } from '@nestjs/common';
import type { AgentConfigService } from '../agent-config/agent-config.service';
import { connectMcp, type McpConnection } from '../agent/mcp/mcp.client';

const logger = new Logger('ToolInventory');

export interface ToolInfo {
  name: string;
  description: string;
  /** JSON schema of the arguments (MCP tools only). */
  inputSchema?: unknown;
  source: 'local' | string;
}

export interface ToolInventory {
  /** False when MCP servers are declared but their tools could not be listed. */
  available: boolean;
  /** Agent name -> tools the agent's definition gives it. */
  byAgent: Record<string, ToolInfo[]>;
}

const infoOf = (tool: StructuredToolInterface, server: string): ToolInfo => {
  let inputSchema: unknown;
  try {
    inputSchema = toJsonSchema(tool.schema as never);
  } catch {
    inputSchema = undefined;
  }
  return { name: tool.name, description: tool.description ?? '', inputSchema, source: server };
};

/**
 * Lists the tools each agent has: local tool names from the definition and the tools of its MCP
 * servers, read with the caller's token. Lists only; no tool is invoked.
 */
export async function loadToolInventory(
  config: AgentConfigService,
  idToken: string | undefined,
  connect: (
    servers: Record<string, string>,
    token: string | undefined,
  ) => Promise<McpConnection> = connectMcp,
): Promise<ToolInventory> {
  const servers = config.mcpServers;
  const declared = Object.keys(servers).length > 0;
  let byServer: Record<string, ToolInfo[]> = {};
  let available = !declared;

  if (declared) {
    let conn: McpConnection | undefined;
    try {
      conn = await connect(servers, idToken);
      byServer = Object.fromEntries(
        Object.entries(conn.toolsByServer).map(([server, tools]) => [
          server,
          tools.map((t) => infoOf(t, server)),
        ]),
      );
      available = Object.values(byServer).some((tools) => tools.length > 0);
    } catch (err) {
      logger.warn(`Tool inventory unavailable: ${(err as Error).message}`);
    } finally {
      await conn?.close();
    }
  }

  const byAgent: Record<string, ToolInfo[]> = {};
  for (const [name, def] of Object.entries(config.agents)) {
    byAgent[name] = def.tools.flatMap((ref): ToolInfo[] =>
      ref.type === 'local'
        ? [{ name: ref.name, description: '', source: 'local' }]
        : (byServer[ref.server] ?? []),
    );
  }
  return { available, byAgent };
}
