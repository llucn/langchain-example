/**
 * The agent definitions and parameters are not in code: they come from the Agent Config (a Git
 * repository, see `agent-config/`). This file only re-exports the types.
 */
export type {
  AgentDefinition,
  AgentSettings,
  AgentToolRef,
  LoadedAgentConfig,
} from '../agent-config/agent-config.types';
export { INITIAL_AGENT } from '../agent-config/agent-config.service';

/** Agent names are data now; unknown names are handled by `AgentConfigService.resolveAgent`. */
export type AgentName = string;
