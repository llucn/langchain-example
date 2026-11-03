import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  MEMORY_MAX_LENGTH,
  MEMORY_MAX_PER_USER,
  type AdminMemory,
  type AdminMemoryPage,
  type Memory,
  type MemorySource,
} from '@app/shared';
import { IsNull, Repository } from 'typeorm';
import { User } from '../database/entities/user.entity';
import { UserMemory } from '../database/entities/user-memory.entity';

/** Whitespace collapsed and trimmed. */
export const normalizeMemory = (content: string): string => content.replace(/\s+/g, ' ').trim();

/** Why a content cannot be stored, or null when it can. */
export const contentProblem = (clean: string): string | null =>
  !clean
    ? 'memory content is empty'
    : clean.length > MEMORY_MAX_LENGTH
      ? `memory content is longer than ${MEMORY_MAX_LENGTH} characters`
      : null;

/** The first 8 characters of the id, which the prompt shows so `forgetMemory` can name a memory. */
export const shortId = (id: string): string => id.slice(0, 8);

const escapeLike = (text: string) => text.replace(/[\\%_]/g, (c) => `\\${c}`);

export const toMemoryDto = (m: UserMemory): Memory => ({
  id: m.id,
  content: m.content,
  source: m.source,
  sessionId: m.sessionId,
  createdAt: m.createdAt.toISOString(),
  updatedAt: m.updatedAt.toISOString(),
});

export interface SaveResult {
  memory: UserMemory;
  /** False when an identical memory existed and nothing was added. */
  created: boolean;
  /** The oldest memory deleted to make room, when the owner was at the maximum. */
  evicted?: UserMemory;
}

@Injectable()
export class MemoryService {
  constructor(
    @InjectRepository(UserMemory) private readonly memories: Repository<UserMemory>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  private owner(ownerSub: string | null) {
    return { ownerSub: ownerSub ?? IsNull() };
  }

  /** The owner's memories, newest first. */
  list(ownerSub: string | null): Promise<UserMemory[]> {
    return this.memories.find({ where: this.owner(ownerSub), order: { createdAt: 'DESC' } });
  }

  /** The newest `max` memories of the owner, oldest first (the order the prompt lists them). */
  async recent(ownerSub: string | null, max: number): Promise<UserMemory[]> {
    const newest = await this.memories.find({
      where: this.owner(ownerSub),
      order: { createdAt: 'DESC' },
      take: max,
    });
    return newest.reverse();
  }

  /** Adds a memory by the owner's own hand; rejects when the owner is at the maximum. */
  async create(ownerSub: string | null, content: string): Promise<UserMemory> {
    const clean = normalizeMemory(content);
    const problem = contentProblem(clean);
    if (problem) throw new BadRequestException(problem);
    if ((await this.memories.count({ where: this.owner(ownerSub) })) >= MEMORY_MAX_PER_USER)
      throw new BadRequestException(
        `memory is full (${MEMORY_MAX_PER_USER}); delete a memory to add another`,
      );
    return this.memories.save(
      this.memories.create({ ownerSub, content: clean, source: 'user', sessionId: null }),
    );
  }

  /**
   * Stores a memory for an agent. An identical one (case-insensitive) is kept as it is; at the
   * maximum the owner's oldest memory is deleted in the same transaction to make room.
   */
  async save(
    ownerSub: string | null,
    content: string,
    sessionId: string | null,
    source: MemorySource = 'agent',
  ): Promise<SaveResult> {
    const clean = normalizeMemory(content);
    const problem = contentProblem(clean);
    if (problem) throw new BadRequestException(problem);
    return this.memories.manager.transaction(async (manager) => {
      const repo = manager.getRepository(UserMemory);
      const mine = await repo.find({ where: this.owner(ownerSub), order: { createdAt: 'ASC' } });
      const same = mine.find((m) => m.content.toLowerCase() === clean.toLowerCase());
      if (same) return { memory: same, created: false };
      let evicted: UserMemory | undefined;
      if (mine.length >= MEMORY_MAX_PER_USER) {
        evicted = mine[0];
        await repo.delete(evicted.id);
      }
      const memory = await repo.save(repo.create({ ownerSub, content: clean, source, sessionId }));
      return { memory, created: true, evicted };
    });
  }

  private async mine(ownerSub: string | null, id: string): Promise<UserMemory> {
    const memory = await this.memories.findOne({ where: { id, ...this.owner(ownerSub) } });
    if (!memory) throw new NotFoundException('Memory not found');
    return memory;
  }

  /** The owner's memory with this full id or 8-character short id; undefined when none. */
  async findByRef(ownerSub: string | null, ref: string): Promise<UserMemory | undefined> {
    const key = ref.trim().toLowerCase();
    if (!/^[0-9a-f-]{8,36}$/.test(key)) return undefined;
    const all = await this.memories.find({ where: this.owner(ownerSub) });
    return all.find((m) => m.id === key || (key.length === 8 && shortId(m.id) === key));
  }

  async update(ownerSub: string | null, id: string, content: string): Promise<UserMemory> {
    return this.edit(await this.mine(ownerSub, id), content);
  }

  async remove(ownerSub: string | null, id: string): Promise<void> {
    await this.memories.delete((await this.mine(ownerSub, id)).id);
  }

  private async edit(memory: UserMemory, content: string): Promise<UserMemory> {
    const clean = normalizeMemory(content);
    const problem = contentProblem(clean);
    if (problem) throw new BadRequestException(problem);
    memory.content = clean;
    memory.updatedAt = new Date();
    return this.memories.save(memory);
  }

  /** Every user's memories, newest first, optionally only those whose owner's email contains `email`. */
  async listAll(filter: {
    email?: string;
    page: number;
    pageSize: number;
  }): Promise<AdminMemoryPage> {
    const q = this.memories
      .createQueryBuilder('m')
      .leftJoin(User, 'u', 'u.sub = m."ownerSub"')
      .addSelect('u.email', 'ownerEmail')
      .orderBy('m."createdAt"', 'DESC');
    const email = filter.email?.trim();
    if (email) q.andWhere(`u.email ILIKE :email ESCAPE '\\'`, { email: `%${escapeLike(email)}%` });
    const total = await q.getCount();
    const { entities, raw } = await q
      .offset((filter.page - 1) * filter.pageSize)
      .limit(filter.pageSize)
      .getRawAndEntities();
    const emails = new Map(
      raw.map((r: Record<string, unknown>) => [r.m_id as string, (r.ownerEmail as string) ?? null]),
    );
    const items: AdminMemory[] = entities.map((m) => ({
      ...toMemoryDto(m),
      ownerSub: m.ownerSub,
      ownerEmail: emails.get(m.id) ?? null,
    }));
    return { items, total, page: filter.page, pageSize: filter.pageSize };
  }

  async adminUpdate(id: string, content: string): Promise<AdminMemory> {
    const memory = await this.memories.findOne({ where: { id } });
    if (!memory) throw new NotFoundException('Memory not found');
    const saved = await this.edit(memory, content);
    const owner = saved.ownerSub
      ? await this.users.findOne({ where: { sub: saved.ownerSub } })
      : null;
    return { ...toMemoryDto(saved), ownerSub: saved.ownerSub, ownerEmail: owner?.email ?? null };
  }

  async adminRemove(id: string): Promise<void> {
    const result = await this.memories.delete(id);
    if (!result.affected) throw new NotFoundException('Memory not found');
  }
}
