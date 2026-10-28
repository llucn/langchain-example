import type { AgentToolContext, AgentToolFactory } from '../agent.context';
import { createRenameSessionTool } from './rename-session.tool';
import { createSelectAgentTool } from './select-agent.tool';

/**
 * Local tools the agent has; add new ones here. The getWeather/getUsers/sendMail tools still exist
 * in this folder but are not registered; business tools come from the MCP servers.
 */
export const TOOL_FACTORIES: AgentToolFactory[] = [createRenameSessionTool, createSelectAgentTool];

export const buildTools = (ctx: AgentToolContext) => TOOL_FACTORIES.map((f) => f(ctx));
