import { isDeepStrictEqual } from 'node:util';
import { AgentConfigError } from '../agent-config/agent-config.error';
import type { ConfigFiles } from '../agent-config/agent-config.types';
import { parseYaml } from '../agent-config/render';
import { assembleConfig } from '../agent-config/validate';

/** Keys of an agent file a proposal may change; everything else (e.g. `model`) stays as it is. */
export const EDITABLE_AGENT_KEYS = ['systemPrompt', 'tools', 'outputConfig', 'maxTokens'] as const;

export interface ChangeCheckInput {
  base: ConfigFiles;
  proposed: ConfigFiles;
  /** Agents whose file may change (the selector for a `routing` diagnosis). */
  allowedAgents: ReadonlySet<string>;
  /** `settings` of `config.yml` may change (a `settings` diagnosis exists). */
  allowSettings: boolean;
  knownLocalTools: readonly string[];
  identity: { hash: string; version: string; source: string };
}

const asObject = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

const parse = (file: string, text: string, problems: string[]) => {
  try {
    return asObject(parseYaml(text));
  } catch (err) {
    problems.push(`${file}: ${(err as Error).message.split('\n')[0]}`);
    return undefined;
  }
};

/** Paths (relative to the config directory) of the files whose text differs. */
export function changedPaths(base: ConfigFiles, proposed: ConfigFiles): string[] {
  const paths: string[] = [];
  if (base.configYml !== proposed.configYml) paths.push('config.yml');
  for (const name of Object.keys(base.agents)) {
    if (base.agents[name] !== proposed.agents[name]) paths.push(`agents/${name}.yml`);
  }
  return paths;
}

/**
 * Checks, independent of the model that wrote them, that the proposed files stay on the allowed
 * surface (see the `improvement-proposals` spec) and that the result is a valid Agent Config.
 * Returns the problems found; an empty list means the change is acceptable.
 */
export function checkConfigChange(input: ChangeCheckInput): string[] {
  const { base, proposed } = input;
  const problems: string[] = [];

  const baseNames = Object.keys(base.agents).sort();
  const proposedNames = Object.keys(proposed.agents).sort();
  if (!isDeepStrictEqual(baseNames, proposedNames)) {
    problems.push('agent files may not be added or removed');
  }

  for (const name of baseNames) {
    const next = proposed.agents[name];
    if (next === undefined || next === base.agents[name]) continue;
    const file = `agents/${name}.yml`;
    if (!input.allowedAgents.has(name)) {
      problems.push(`${file}: this agent is not part of the diagnosis and must not change`);
      continue;
    }
    const a = parse(file, base.agents[name], problems);
    const b = parse(file, next, problems);
    if (!a || !b) continue;
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if ((EDITABLE_AGENT_KEYS as readonly string[]).includes(key)) continue;
      if (!isDeepStrictEqual(a[key], b[key])) problems.push(`${file}: \`${key}\` must not change`);
    }
  }

  if (base.configYml !== proposed.configYml) {
    const a = parse('config.yml', base.configYml, problems);
    const b = parse('config.yml', proposed.configYml, problems);
    if (a && b) {
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
        if (key === 'settings') continue;
        if (!isDeepStrictEqual(a[key], b[key]))
          problems.push(`config.yml: \`${key}\` must not change`);
      }
      if (!input.allowSettings && !isDeepStrictEqual(a.settings, b.settings)) {
        problems.push('config.yml: `settings` may only change for a `settings` diagnosis');
      }
    }
  }

  if (problems.length) return problems;
  try {
    assembleConfig(proposed, input.identity, input.knownLocalTools);
  } catch (err) {
    if (err instanceof AgentConfigError) problems.push(...err.problems);
    else throw err;
  }
  return problems;
}
