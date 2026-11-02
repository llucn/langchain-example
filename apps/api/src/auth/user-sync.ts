import type { Repository } from 'typeorm';
import type { User } from '../database/entities/user.entity';

/**
 * Makes sure the `users` row of the token's `sub` exists and has the token's email: inserts it when
 * missing, updates the email when it differs, writes nothing otherwise. Returns whether it wrote.
 */
export async function syncUser(
  users: Pick<Repository<User>, 'findOne' | 'insert' | 'update'>,
  claims: Record<string, unknown> | undefined,
): Promise<boolean> {
  const sub = claims?.sub;
  if (typeof sub !== 'string' || !sub) return false;
  const email = typeof claims?.email === 'string' && claims.email ? claims.email : null;
  const existing = await users.findOne({ where: { sub } });
  if (!existing) {
    await users.insert({ sub, email });
    return true;
  }
  // A token without an email never erases a known one.
  if (email && existing.email !== email) {
    await users.update({ sub }, { email });
    return true;
  }
  return false;
}
