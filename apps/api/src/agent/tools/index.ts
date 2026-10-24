import type { AgentToolContext, AgentToolFactory } from '../agent.context';
import { createGetUsersTool } from './get-users.tool';
import { getWeather } from './get-weather.tool';
import { sendMail } from './send-mail.tool';
import { createRenameSessionTool } from './rename-session.tool';

/** Every tool the agent has; add new ones here. */
export const TOOL_FACTORIES: AgentToolFactory[] = [
  () => getWeather,
  ({ users }) => createGetUsersTool(users),
  () => sendMail,
  createRenameSessionTool,
];

export const buildTools = (ctx: AgentToolContext) => TOOL_FACTORIES.map((f) => f(ctx));
