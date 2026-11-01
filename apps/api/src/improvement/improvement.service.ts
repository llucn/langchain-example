import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type {
  Diagnosis,
  ImprovementCase as ImprovementCaseDto,
  ImprovementFile,
  ImprovementProposal as ImprovementProposalDto,
  ImprovementProposalSummary,
} from '@app/shared';
import { In, Repository } from 'typeorm';
import { AgentConfigService } from '../agent-config/agent-config.service';
import { APP_ENV, type AppEnv } from '../config/env';
import { LOCAL_TOOL_NAMES } from '../agent/tools';
import { AgentConfigSnapshot } from '../database/entities/agent-config-snapshot.entity';
import { ChatLogMessage } from '../database/entities/chat-log-message.entity';
import { ChatLogReview } from '../database/entities/chat-log-review.entity';
import { ImprovementCase } from '../database/entities/improvement-case.entity';
import { ImprovementProposal } from '../database/entities/improvement-proposal.entity';
import { CaseBuilder } from './case-builder';
import { ConfigFilesProvider } from './config-files.provider';
import { changedPaths, checkConfigChange } from './config-change.checker';
import { diagnoseCase } from './diagnosis.agent';
import { createEvolutionCaller, type StructuredCaller } from './evolution.model';
import { ACTIONABLE_LAYERS, proposeChange, type ActionableCase } from './proposal.agent';
import { loadToolInventory, type ToolInventory } from './tool-inventory';
import { unifiedDiff } from './unified-diff';

/** Generations that run at the same time. */
const CONCURRENCY = 2;

export interface Requester {
  sub: string | null;
  name: string | null;
  /** The admin's JWT, forwarded to the MCP servers to list their tools. */
  idToken?: string;
}

/** Runs at most `limit` tasks at a time; the rest wait in order. */
export class Limiter {
  private active = 0;
  private readonly queue: (() => void)[] = [];
  constructor(private readonly limit: number) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) await new Promise<void>((resolve) => this.queue.push(resolve));
    this.active++;
    try {
      return await task();
    } finally {
      this.active--;
      this.queue.shift()?.();
    }
  }
}

const notesFor = (reviewId: string, d: Diagnosis) =>
  `Review ${reviewId} (${d.layer}, confidence ${d.confidence.toFixed(2)}): ${d.rootCause} ${d.suggestedAction}`.trim();

@Injectable()
export class ImprovementService implements OnModuleInit {
  private readonly logger = new Logger(ImprovementService.name);
  private readonly limiter = new Limiter(CONCURRENCY);
  private readonly pending = new Set<Promise<unknown>>();

  constructor(
    @Inject(APP_ENV) private readonly env: AppEnv,
    private readonly config: AgentConfigService,
    @InjectRepository(ImprovementProposal)
    private readonly proposals: Repository<ImprovementProposal>,
    @InjectRepository(ImprovementCase) private readonly cases: Repository<ImprovementCase>,
    @InjectRepository(ChatLogReview) private readonly reviews: Repository<ChatLogReview>,
    @InjectRepository(ChatLogMessage) private readonly messages: Repository<ChatLogMessage>,
    @InjectRepository(AgentConfigSnapshot)
    private readonly snapshots: Repository<AgentConfigSnapshot>,
  ) {
    this.caller = () => createEvolutionCaller(config, env);
    this.files = new ConfigFilesProvider(env.agentConfig, config);
    this.inventory = (token) => loadToolInventory(config, token);
  }

  /** Replaceable in tests. */
  caller: () => StructuredCaller;
  files: Pick<ConfigFilesProvider, 'current'>;
  inventory: (token: string | undefined) => Promise<ToolInventory>;

  /** A generation the API did not finish cannot resume: mark it failed. */
  async onModuleInit(): Promise<void> {
    const res = await this.proposals.update(
      { status: 'generating' },
      { status: 'failed', error: 'interrupted' },
    );
    if (res.affected) this.logger.warn(`${res.affected} unfinished proposal(s) set to failed`);
  }

  /** Resolves when the running generations are done (tests, shutdown). */
  idle = () => Promise.allSettled([...this.pending]);

  /**
   * Validates the reviews, creates one proposal per agent in `generating` and continues in the
   * background. Returns the proposal ids.
   */
  async create(reviewIds: string[], by: Requester): Promise<string[]> {
    const reviews = await this.reviews.findBy({ id: In(reviewIds) });
    const found = new Map(reviews.map((r) => [r.id, r]));
    for (const id of reviewIds) {
      const r = found.get(id);
      if (!r) throw new BadRequestException(`Review ${id} does not exist`);
      if (r.rating !== 'bad') throw new BadRequestException(`Review ${id} is not a Bad review`);
      if (!r.messageId) {
        throw new BadRequestException(`Review ${id} is a session-level review; review a message`);
      }
    }
    const messages = await this.messages.findBy({
      id: In(reviews.map((r) => r.messageId as string)),
    });
    const msgById = new Map(messages.map((m) => [m.id, m]));

    const groups = new Map<string, { review: ChatLogReview; message: ChatLogMessage }[]>();
    for (const id of reviewIds) {
      const review = found.get(id) as ChatLogReview;
      const message = msgById.get(review.messageId as string);
      if (!message) throw new BadRequestException(`The event of review ${id} no longer exists`);
      const agent = message.agentName;
      if (!agent || !this.config.has(agent)) {
        throw new BadRequestException(
          `Review ${id} is about agent "${agent ?? ''}", which the running config does not define`,
        );
      }
      groups.set(agent, [...(groups.get(agent) ?? []), { review, message }]);
    }

    const ids: string[] = [];
    for (const [agentName, items] of groups) {
      const proposal = await this.proposals.save(
        this.proposals.create({
          agentName,
          status: 'generating',
          baseCommit: this.config.hash,
          baseSource: this.config.source,
          createdBy: by.sub,
          createdByName: by.name,
        }),
      );
      ids.push(proposal.id);
      const job = this.limiter
        .run(() => this.generate(proposal.id, agentName, items, by))
        .catch((err) => this.fail(proposal.id, err))
        .finally(() => this.pending.delete(job));
      this.pending.add(job);
    }
    return ids;
  }

  private async fail(id: string, err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    this.logger.error(`Proposal ${id} failed: ${message}`);
    await this.proposals.update({ id }, { status: 'failed', error: message.slice(0, 4000) });
  }

  private async generate(
    proposalId: string,
    agentName: string,
    items: { review: ChatLogReview; message: ChatLogMessage }[],
    by: Requester,
  ): Promise<void> {
    const caller = this.caller();
    const builder = new CaseBuilder(this.messages, this.snapshots);
    const inventory = await this.inventory(by.idToken);
    const tools = (agent: string) =>
      inventory.available ? (inventory.byAgent[agent] ?? []) : null;

    const built = [];
    for (const { review, message } of items) {
      const b = await builder.build(review, message);
      const row = await this.cases.save(
        this.cases.create({
          proposalId,
          reviewId: review.id,
          evidence: b.evidence,
          diagnosis: null,
        }),
      );
      built.push({ row, ...b });
    }

    const actionable: ActionableCase[] = [];
    const notes: string[] = [];
    for (const b of built) {
      const diagnosis = await diagnoseCase(caller, {
        evidence: b.evidence,
        tools: tools(b.evidence.agentName),
        insufficient: b.insufficient,
      });
      await this.cases.update({ id: b.row.id }, { diagnosis });
      if (ACTIONABLE_LAYERS.includes(diagnosis.layer)) {
        actionable.push({ reviewId: b.row.reviewId, diagnosis, evidence: b.evidence });
      } else {
        notes.push(notesFor(b.row.reviewId, diagnosis));
      }
    }
    if (!inventory.available) {
      notes.push('The tool inventory could not be read; tool-related diagnoses were not possible.');
    }

    let files: ImprovementFile[] = [];
    let diff = '';
    let rationale = '';
    if (actionable.length) {
      const base = await this.files.current();
      const allowedAgents = new Set([agentName]);
      if (actionable.some((c) => c.diagnosis.layer === 'routing')) allowedAgents.add('selector');
      const allowSettings = actionable.some((c) => c.diagnosis.layer === 'settings');
      const identity = {
        hash: this.config.hash,
        version: this.config.version,
        source: this.config.source,
      };
      const result = await proposeChange(caller, {
        agentName,
        cases: actionable,
        base,
        tools: tools(agentName),
        check: (proposed) =>
          checkConfigChange({
            base,
            proposed,
            allowedAgents,
            allowSettings,
            knownLocalTools: LOCAL_TOOL_NAMES,
            identity,
          }),
      });
      rationale = result.rationale;
      files = changedPaths(base, result.proposed).map((path): ImprovementFile => {
        const text = (f: typeof base) =>
          path === 'config.yml'
            ? f.configYml
            : f.agents[path.slice('agents/'.length, -'.yml'.length)];
        return { path, base: text(base), proposed: text(result.proposed) };
      });
      diff = files.map((f) => unifiedDiff(f.path, f.base, f.proposed)).join('\n');
      if (!files.length) notes.push('The model proposed no change to the config files.');
    }

    await this.proposals.update(
      { id: proposalId },
      { status: 'ready', files, diff, rationale, notes, inventoryAvailable: inventory.available },
    );
  }

  async list(): Promise<ImprovementProposalSummary[]> {
    const rows = await this.proposals.find({ order: { createdAt: 'DESC' }, take: 100 });
    const counts = new Map<string, number>();
    if (rows.length) {
      const cases = await this.cases.find({
        where: { proposalId: In(rows.map((r) => r.id)) },
        select: { id: true, proposalId: true },
      });
      for (const c of cases) counts.set(c.proposalId, (counts.get(c.proposalId) ?? 0) + 1);
    }
    return rows.map((p) => ({
      id: p.id,
      agentName: p.agentName,
      status: p.status,
      baseCommit: p.baseCommit,
      createdByName: p.createdByName,
      caseCount: counts.get(p.id) ?? 0,
      hasDiff: p.files.length > 0,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    }));
  }

  async get(id: string): Promise<ImprovementProposalDto> {
    const p = await this.proposals.findOneBy({ id });
    if (!p) throw new NotFoundException('Proposal not found');
    const cases = await this.cases.find({ where: { proposalId: id }, order: { id: 'ASC' } });
    return {
      id: p.id,
      agentName: p.agentName,
      status: p.status,
      baseCommit: p.baseCommit,
      baseSource: p.baseSource,
      createdByName: p.createdByName,
      hasDiff: p.files.length > 0,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      files: p.files,
      diff: p.diff,
      rationale: p.rationale,
      notes: p.notes,
      error: p.error,
      inventoryAvailable: p.inventoryAvailable,
      cases: cases.map((c): ImprovementCaseDto => ({
        id: c.id,
        reviewId: c.reviewId,
        evidence: c.evidence,
        diagnosis: c.diagnosis,
      })),
    };
  }

  /** Only a finished proposal (`ready` or `failed`) can be discarded. */
  async discard(id: string): Promise<void> {
    const res = await this.proposals
      .createQueryBuilder()
      .update()
      .set({ status: 'discarded' })
      .where('id = :id AND status IN (:...from)', { id, from: ['ready', 'failed'] })
      .execute();
    if (res.affected) return;
    const p = await this.proposals.findOneBy({ id });
    if (!p) throw new NotFoundException('Proposal not found');
    throw new ConflictException(`A ${p.status} proposal cannot be discarded`);
  }
}
