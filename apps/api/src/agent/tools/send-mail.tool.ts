import { tool } from '@langchain/core/tools';
import { z } from 'zod';

/** Mock: nothing is sent, it always reports success. */
export function mockSendMail(to: string[], subject: string, body: string) {
  return { success: true, to, subject, bodyLength: body.length, source: 'mock' };
}

export const sendMail = tool(
  async ({ to, subject, body }) => JSON.stringify(mockSendMail(to, subject, body)),
  {
    name: 'sendMail',
    description: 'Send an email to one or more recipients.',
    schema: z.object({
      to: z.array(z.string()).min(1).describe('Recipient email addresses'),
      subject: z.string().describe('Email subject'),
      body: z.string().describe('Email body'),
    }),
  },
);
