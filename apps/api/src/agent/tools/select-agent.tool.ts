import type { BaseMessage } from '@langchain/core/messages';
import { ToolMessage } from '@langchain/core/messages';
import { tool, type ToolRuntime } from '@langchain/core/tools';
import { Command } from '@langchain/langgraph';
import { z } from 'zod';
import type { AgentToolFactory } from '../agent.context';

/** The selector stays active until it routes, so every user message so far is a selector turn. */
export const selectorTurn = (messages: BaseMessage[]): number =>
  messages.filter((m) => m.type === 'human').length;

/** Hands the conversation over to a downstream agent by updating the agent state. */
export const createSelectAgentTool: AgentToolFactory = ({ config }) => {
  const { maxTurns, minConfidence } = config.settings.selector;
  return tool(
    async (
      { agentName, confidence, summary },
      runtime: ToolRuntime<{ messages: BaseMessage[] }>,
    ) => {
      const turn = selectorTurn(runtime.state.messages ?? []);
      if (confidence < minConfidence && turn < maxTurns) {
        return JSON.stringify({
          success: false,
          error: `Confidence ${confidence} is below ${minConfidence}. Do not route yet: ask the user one focused clarifying question.`,
        });
      }
      return new Command({
        update: {
          currentAgent: agentName,
          routingSummary: summary,
          messages: [
            new ToolMessage({
              content: JSON.stringify({ success: true, agent: agentName }),
              name: 'selectAgent',
              tool_call_id: runtime.toolCallId,
            }),
          ],
        },
      });
    },
    {
      name: 'selectAgent',
      description:
        'Hand the conversation over to the downstream agent that should handle it, with a summary of what the user wants.',
      schema: z.object({
        agentName: z
          .enum(config.downstreamAgents())
          .describe('The downstream agent to hand over to'),
        confidence: z.number().min(0).max(1).describe('Confidence in the choice, 0.0 to 1.0'),
        summary: z
          .string()
          .describe('Concise summary: core intent, key entities and relevant earlier context'),
      }),
    },
  );
};
