import { ChatAnthropic } from '@langchain/anthropic';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { z } from 'zod';
import type { AgentConfigService } from '../agent-config/agent-config.service';
import { modelConnection } from '../agent/agent.service';
import type { AppEnv } from '../config/env';

/** Per-call limit; a stuck model call must not hold a generation forever. */
const CALL_TIMEOUT_MS = 180_000;

export interface StructuredCall<T> {
  /** Name of the structured output (the forced tool's name). */
  name: string;
  schema: z.ZodType<T>;
  system: string;
  user: string;
}

/**
 * One model call that must answer in a schema; the improvement agents have no tools. The native
 * JSON-schema output is used because gateways may reject a forced tool choice (the other method).
 */
export interface StructuredCaller {
  call<T>(opts: StructuredCall<T>): Promise<T>;
}

/** Builds the caller over `EVOLUTION_MODEL` and the runtime agents' model connection. */
export function createEvolutionCaller(config: AgentConfigService, env: AppEnv): StructuredCaller {
  const { baseUrl, apiKey } = modelConnection(config, env);
  if (!baseUrl)
    throw new Error('MODEL_BASE_URL is not set (nor model.baseUrl in the Agent Config)');
  if (!apiKey) throw new Error('MODEL_API_KEY is not set (nor model.apiKey in the Agent Config)');
  const model = new ChatAnthropic({
    model: env.evolution.model,
    apiKey,
    anthropicApiUrl: baseUrl,
    maxTokens: env.evolution.maxTokens,
  });
  return {
    async call<T>({ name, schema, system, user }: StructuredCall<T>): Promise<T> {
      const structured = model.withStructuredOutput(schema as never, { name, method: 'jsonSchema' });
      return (await structured.invoke([new SystemMessage(system), new HumanMessage(user)], {
        signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
      })) as T;
    },
  };
}
