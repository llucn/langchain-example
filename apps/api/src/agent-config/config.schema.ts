import { z } from 'zod';

const toolRef = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('local'), name: z.string().min(1) }),
  z.strictObject({ type: z.literal('mcp'), server: z.string().min(1) }),
]);

export const agentSchema = z.strictObject({
  model: z.string().min(1),
  maxTokens: z.number().int().positive(),
  thinking: z.strictObject({ type: z.literal('adaptive') }),
  outputConfig: z.strictObject({ effort: z.enum(['low', 'medium', 'high']) }),
  tools: z.array(toolRef),
  systemPrompt: z.string().min(1),
});

const settingsSchema = z.strictObject({
  maxContextMessages: z.number().int().positive().default(20),
  recursionLimit: z.number().int().positive().default(10),
  selector: z
    .strictObject({
      maxTurns: z.number().int().positive().default(5),
      minConfidence: z.number().min(0).max(1).default(0.5),
    })
    .prefault({}),
});

export const configSchema = z.strictObject({
  env: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).prefault({}),
  mcpServers: z.record(z.string(), z.string()).prefault({}),
  settings: settingsSchema.prefault({}),
  model: z
    .strictObject({ baseUrl: z.string().min(1).optional(), apiKey: z.string().min(1).optional() })
    .optional(),
});

export type ConfigYml = z.infer<typeof configSchema>;
