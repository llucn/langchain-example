import { resolve } from 'node:path';
import { LOCAL_TOOL_NAMES } from '../agent/tools';
import { AgentConfigService } from './agent-config.service';
import type { LoadedAgentConfig } from './agent-config.types';
import { readLocalConfig } from './source';
import { assembleConfig } from './validate';

/** The sample config of `docs/config-sample`, the fixture of the unit tests. */
export const SAMPLE_CONFIG_DIR = resolve(
  __dirname,
  '../../../../docs/config-sample/langchain-example',
);

export function loadSampleConfig(): LoadedAgentConfig {
  const { files, hash } = readLocalConfig(SAMPLE_CONFIG_DIR);
  return assembleConfig(
    files,
    { hash, version: 'local', source: SAMPLE_CONFIG_DIR },
    LOCAL_TOOL_NAMES,
  );
}

export const sampleAgentConfig = () => new AgentConfigService(loadSampleConfig());
