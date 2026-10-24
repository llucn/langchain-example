import { tool } from '@langchain/core/tools';
import { Repository } from 'typeorm';
import { z } from 'zod';
import { User } from '../../database/entities/user.entity';

export const USERS_DEFAULT_LIMIT = 10;
export const USERS_MAX_LIMIT = 50;

export async function listUsers(repo: Repository<User>, limit?: number) {
  const take = Math.min(Math.max(limit ?? USERS_DEFAULT_LIMIT, 1), USERS_MAX_LIMIT);
  const users = await repo.find({ order: { createdAt: 'DESC' }, take });
  return users.map((u) => ({ id: u.id, email: u.email, createdAt: u.createdAt.toISOString() }));
}

export const createGetUsersTool = (repo: Repository<User>) =>
  tool(async ({ limit }) => JSON.stringify(await listUsers(repo, limit)), {
    name: 'getUsers',
    description: 'List registered users, newest first.',
    schema: z.object({
      limit: z
        .number()
        .int()
        .optional()
        .describe(`Max users to return (default ${USERS_DEFAULT_LIMIT}, max ${USERS_MAX_LIMIT})`),
    }),
  });
