import type { StructuredToolInterface } from '@langchain/core/tools';
import { MultiServerMCPClient } from '@langchain/mcp-adapters';
import { Logger } from '@nestjs/common';

const logger = new Logger('McpClient');

export interface McpConnection {
  tools: StructuredToolInterface[];
  close: () => Promise<void>;
}

const NONE: McpConnection = { tools: [], close: async () => undefined };

/**
 * Connects to the remote MCP servers (streamable HTTP) as the visitor: their JWT is forwarded as the
 * bearer token. Unreachable servers are skipped; without servers or a token nothing is contacted.
 * Tool names are prefixed with the server name. Call `close` when the run ends.
 */
export async function connectMcp(
  servers: Record<string, string>,
  idToken: string | undefined,
): Promise<McpConnection> {
  const names = Object.keys(servers);
  if (!names.length) return NONE;
  if (!idToken) {
    logger.warn('No bearer token on the request; MCP servers are not contacted');
    return NONE;
  }

  const client = new MultiServerMCPClient({
    mcpServers: Object.fromEntries(
      names.map((name) => [
        name,
        {
          transport: 'http' as const,
          url: servers[name],
          headers: { Authorization: `Bearer ${idToken}` },
        },
      ]),
    ),
    prefixToolNameWithServerName: true,
    // Errors must reach the per-server catch below ('ignore' would silently yield zero tools).
    throwOnLoadError: true,
    onConnectionError: 'throw',
  });

  const loaded = await Promise.all(
    names.map(async (name) => {
      try {
        return await client.getTools(name);
      } catch (err) {
        logger.warn(`MCP server "${name}" skipped: ${(err as Error).message}`);
        return [];
      }
    }),
  );

  return {
    tools: loaded.flat(),
    close: () =>
      client.close().catch((err) => logger.warn(`MCP close failed: ${(err as Error).message}`)),
  };
}
