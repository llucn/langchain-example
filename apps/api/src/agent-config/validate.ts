import { Logger } from '@nestjs/common';
import type { ZodError } from 'zod';
import type { AgentDefinition, ConfigFiles, LoadedAgentConfig } from './agent-config.types';
import { AgentConfigError } from './agent-config.error';
import { agentSchema, configSchema } from './config.schema';
import { parseYaml, resolveTree } from './render';

const logger = new Logger('AgentConfig');

export const REQUIRED_AGENTS = ['selector', 'other'] as const;
const AGENT_NAME = /^[a-z][a-z0-9_]*$/;

const issues = (file: string, err: ZodError) =>
  err.issues.map((i) => `${file}: ${i.path.length ? `${i.path.join('.')}: ` : ''}${i.message}`);

const yamlError = (file: string, err: unknown) =>
  `${file}: ${(err as Error).message.split('\n')[0]}`;

/**
 * Builds the validated config from raw files: parses `config.yml`, resolves the placeholders of
 * each agent file against its `env` block and checks the whole. Throws `AgentConfigError` listing
 * all problems; nothing partial is ever returned.
 */
export function assembleConfig(
  files: ConfigFiles,
  identity: { hash: string; version: string; source: string },
  knownLocalTools: readonly string[],
): LoadedAgentConfig {
  const problems: string[] = [];

  let root: ReturnType<typeof configSchema.parse> | undefined;
  try {
    const raw = parseYaml(files.configYml);
    const parsed = configSchema.safeParse(raw ?? {});
    if (parsed.success) root = parsed.data;
    else problems.push(...issues('config.yml', parsed.error));
  } catch (err) {
    problems.push(yamlError('config.yml', err));
  }

  const agents: Record<string, AgentDefinition> = {};
  for (const [name, text] of Object.entries(files.agents)) {
    const file = `agents/${name}.yml`;
    if (!AGENT_NAME.test(name)) {
      problems.push(`${file}: agent name must match ${AGENT_NAME}`);
      continue;
    }
    if (!root) continue; // variables unknown; config.yml problems are reported already
    try {
      const resolved = resolveTree(parseYaml(text), root.env, file, problems);
      const parsed = agentSchema.safeParse(resolved);
      if (parsed.success) agents[name] = parsed.data as AgentDefinition;
      else problems.push(...issues(file, parsed.error));
    } catch (err) {
      problems.push(yamlError(file, err));
    }
  }

  for (const required of REQUIRED_AGENTS) {
    if (!Object.hasOwn(files.agents, required)) {
      problems.push(`agents/${required}.yml: the agent \`${required}\` is required`);
    }
  }

  const mcpServers: Record<string, string> = {};
  if (root) {
    for (const [server, url] of Object.entries(root.mcpServers)) {
      if (url.trim()) mcpServers[server] = url.trim();
      else logger.warn(`MCP server "${server}" has an empty URL and is skipped`);
    }
    const declared = new Set(Object.keys(root.mcpServers));
    for (const [name, def] of Object.entries(agents)) {
      for (const tool of def.tools) {
        if (tool.type === 'local' && !knownLocalTools.includes(tool.name)) {
          problems.push(`agents/${name}.yml: unknown local tool \`${tool.name}\``);
        }
        if (tool.type === 'mcp' && !declared.has(tool.server)) {
          problems.push(`agents/${name}.yml: MCP server \`${tool.server}\` is not in mcpServers`);
        }
      }
    }
  }

  if (problems.length || !root) throw new AgentConfigError(problems);
  return {
    ...identity,
    agents,
    settings: root.settings,
    mcpServers,
    ...(root.model ? { model: root.model } : {}),
  };
}
