import { tool, type StructuredToolInterface } from '@langchain/core/tools';
import type { ReplayCall } from '@app/shared';
import type { McpConnection } from '../../agent/mcp/mcp.client';
import type { ToolInfo } from '../tool-inventory';

/** Result text the replayed agent gets for a call the log has no result for. */
export const UNRECORDED_RESULT =
  '[replay] no recorded result for this call; it was not executed. Continue as if it had succeeded.';

export interface RecordedResult {
  toolName: string;
  args: unknown;
  content: string;
  status: 'ok' | 'error';
}

/** JSON with sorted keys, so equal arguments compare equal whatever their key order. */
export function canonicalJson(v: unknown): string {
  const sort = (x: unknown): unknown =>
    Array.isArray(x)
      ? x.map(sort)
      : x && typeof x === 'object'
        ? Object.fromEntries(
            Object.entries(x)
              .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
              .map(([k, val]) => [k, sort(val)]),
          )
        : x;
  return JSON.stringify(sort(v ?? null));
}

interface LogEvent {
  type: string;
  toolCalls: { id: string; name: string; args: unknown }[] | null;
  toolCallId: string | null;
  toolName: string | null;
  content: string;
  status: 'ok' | 'error';
}

/** Pairs each logged tool result with the call (and arguments) it answered; `events` in log order. */
export function recordedResults(events: LogEvent[]): RecordedResult[] {
  const calls = new Map<string, { name: string; args: unknown }>();
  for (const e of events) {
    for (const c of e.toolCalls ?? []) calls.set(c.id, { name: c.name, args: c.args });
  }
  return events
    .filter((e) => e.type === 'agent_tool_result')
    .map((e) => {
      const call = e.toolCallId ? calls.get(e.toolCallId) : undefined;
      return {
        toolName: e.toolName ?? call?.name ?? '',
        args: call?.args ?? null,
        content: e.content,
        status: e.status,
      };
    });
}

export interface RecordedMcp {
  connection: McpConnection;
  /** Every MCP call made, in order, with whether it had no recorded result. */
  calls: ReplayCall[];
}

/**
 * An MCP connection that never opens a socket: tools have the names and schemas of the inventory
 * and answer from the log. A call matching a recorded one (tool name and canonical arguments)
 * returns that result, each result once, in order; any other call is not executed, gets a marked
 * placeholder and is reported as `unrecorded`.
 */
export function createRecordedMcp(inventory: ToolInfo[], recorded: RecordedResult[]): RecordedMcp {
  const unused = [...recorded];
  const calls: ReplayCall[] = [];

  const make = (info: ToolInfo): StructuredToolInterface =>
    tool(
      async (args: unknown) => {
        const key = canonicalJson(args);
        const at = unused.findIndex(
          (r) => r.toolName === info.name && canonicalJson(r.args) === key,
        );
        if (at >= 0) {
          calls.push({ name: info.name, args, unrecorded: false });
          return unused.splice(at, 1)[0].content;
        }
        calls.push({ name: info.name, args, unrecorded: true });
        return UNRECORDED_RESULT;
      },
      {
        name: info.name,
        description: info.description || info.name,
        schema: (info.inputSchema as Record<string, unknown> | undefined) ?? {
          type: 'object',
          properties: {},
          additionalProperties: true,
        },
      },
    ) as StructuredToolInterface;

  const mcpTools = inventory.filter((t) => t.source !== 'local');
  const toolsByServer: Record<string, StructuredToolInterface[]> = {};
  for (const info of mcpTools) (toolsByServer[info.source] ??= []).push(make(info));
  return {
    calls,
    connection: {
      tools: Object.values(toolsByServer).flat(),
      toolsByServer,
      close: async () => undefined,
    },
  };
}
