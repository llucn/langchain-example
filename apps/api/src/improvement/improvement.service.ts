import {
  BadGatewayException,
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
import { GitHubWriteError, GitHubWriter } from '../agent-config/github-writer';
import { parseSource, type GitHubSource } from '../agent-config/source';
import { APP_ENV, type AppEnv } from '../config/env';
import { LOCAL_TOOL_NAMES } from '../agent/tools';
import { AgentConfigSnapshot } from '../database/entities/agent-config-snapshot.entity';
import { ChatLogMessage } from '../database/entities/chat-log-message.entity';
import { ChatLogReview } from '../database/entities/chat-log-review.entity';
import { ImprovementCase } from '../database/entities/improvement-case.entity';
import { ImprovementProposal } from '../database/entities/improvement-proposal.entity';
import { ImprovementReplay } from '../database/entities/improvement-replay.entity';
import { CaseBuilder } from './case-builder';
import type { ConfigFiles } from '../agent-config/agent-config.types';
import { ConfigFilesProvider } from './config-files.provider';
import { changedPaths, checkConfigChange } from './config-change.checker';
import { diagnoseCase } from './diagnosis.agent';
import { createEvolutionCaller, type StructuredCaller } from './evolution.model';
import { ACTIONABLE_LAYERS, proposeChange, type ActionableCase } from './proposal.agent';
import { Limiter } from './limiter';
import { loadToolInventory, type ToolInventory } from './tool-inventory';
import { branchName, commitMessage, pullRequestBody, pullRequestTitle } from './pull-request';
import { agentRunner, type ReplayRunner } from './replay/replay';
import { ReplayPhase, toReplayDto, type ReplayTarget } from './replay/replay.phase';
import { unifiedDiff } from './unified-diff';

/** Generations that run at the same time. */
const CONCURRENCY = 2;

export interface Requester {
  sub: string | null;
  name: string | null;
  /** The admin's JWT, forwarded to the MCP servers to list their tools. */
  idToken?: string;
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
    @InjectRepository(ImprovementReplay) private readonly replays: Repository<ImprovementReplay>,
  ) {
    this.replayRunner = agentRunner(env);
    this.github = () => {
      const src = this.githubSource();
      if (!src) throw new ConflictException('Publishing is not available for this config source');
      return new GitHubWriter(src, { token: env.agentConfig.githubToken });
    };
    this.caller = () => createEvolutionCaller(config, env);
    this.files = new ConfigFilesProvider(env.agentConfig, config);
    this.inventory = (token) => loadToolInventory(config, token);
  }

  /** Replaceable in tests. */
  caller: () => StructuredCaller;
  files: Pick<ConfigFilesProvider, 'current'>;
  inventory: (token: string | undefined) => Promise<ToolInventory>;
  replayRunner: ReplayRunner;
  github: () => Pick<
    GitHubWriter,
    | 'defaultBranch'
    | 'head'
    | 'fileText'
    | 'createBranch'
    | 'deleteBranch'
    | 'commitFiles'
    | 'openPullRequest'
  >;

  /** The config repository when it is on GitHub and a token is set; null for a local directory. */
  private githubSource(): GitHubSource | null {
    const { source, githubApiUrl, githubToken } = this.env.agentConfig;
    if (!source || !githubToken) return null;
    const parsed = parseSource(source, githubApiUrl);
    return parsed.kind === 'github' ? parsed : null;
  }

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
    let replay:
      | { proposed: ConfigFiles; identity: { hash: string; version: string; source: string } }
      | undefined;
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
      else replay = { proposed: result.proposed, identity };
    }

    if (replay) {
      if (!inventory.available) {
        notes.push(
          'Replay was skipped: it needs the MCP tool inventory, which could not be read (run it where authentication is on).',
        );
      } else {
        try {
          const byId = new Map(items.map((i) => [i.review.id, i]));
          const targets = actionable.flatMap((a): ReplayTarget[] => {
            const item = byId.get(a.reviewId);
            return item ? [{ ...item, routing: a.diagnosis.layer === 'routing' }] : [];
          });
          const unique = new Map(
            Object.values(inventory.byAgent)
              .flat()
              .map((t) => [`${t.source}/${t.name}`, t]),
          );
          await new ReplayPhase({
            messages: this.messages,
            reviews: this.reviews,
            snapshots: this.snapshots,
            replays: this.replays,
            run: this.replayRunner,
            caller,
            knownLocalTools: LOCAL_TOOL_NAMES,
          }).run({
            proposalId,
            agentName,
            targets,
            proposed: replay.proposed,
            identity: replay.identity,
            inventory: [...unique.values()],
          });
        } catch (err) {
          // Replay is advisory: its failure must not lose the proposal.
          this.logger.error(`Replay of proposal ${proposalId} failed: ${(err as Error).message}`);
          notes.push(`Replay failed: ${(err as Error).message}`);
        }
      }
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
    const replays = await this.replays.find({
      where: { proposalId: id },
      order: { createdAt: 'ASC' },
    });
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
      stale: p.stale,
      branch: p.branch,
      prUrl: p.prUrl,
      publishAvailable:
        this.githubSource() !== null &&
        p.status === 'ready' &&
        p.files.length > 0 &&
        !p.stale &&
        !p.branch,
      replays: replays.map(toReplayDto),
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

  /**
   * Opens a pull request for a ready proposal: new branch, one commit, open PR; never the default
   * branch, never a merge. The branch name is claimed first (one statement), so a second request
   * for the same proposal is refused while the first one works.
   */
  async publish(id: string): Promise<{ branch: string; prUrl: string }> {
    const p = await this.proposals.findOneBy({ id });
    if (!p) throw new NotFoundException('Proposal not found');
    if (!this.githubSource()) {
      throw new ConflictException(
        'Publishing is not available: it needs a GitHub config source and CONFIG_GITHUB_TOKEN',
      );
    }
    if (p.status !== 'ready' || !p.files.length) {
      throw new ConflictException(`A ${p.status} proposal without changes cannot be published`);
    }
    if (p.stale) {
      throw new ConflictException(
        'The config changed since this proposal was made; generate it again',
      );
    }

    const writer = this.github();
    const branch = branchName(p.id);
    const claim = await this.proposals
      .createQueryBuilder()
      .update()
      .set({ branch })
      .where('id = :id AND status = :status AND branch IS NULL', { id, status: 'ready' })
      .execute();
    if (!claim.affected) {
      throw new ConflictException('This proposal is already published or being published');
    }

    let created = false;
    try {
      const base = await writer.defaultBranch();
      const head = await writer.head(base);
      for (const f of p.files) {
        if ((await writer.fileText(f.path, head.commit)) !== f.base) {
          await this.proposals.update({ id }, { stale: true });
          throw new ConflictException(
            `${f.path} changed on ${base} since this proposal was made; generate it again`,
          );
        }
      }
      await writer.createBranch(branch, head.commit);
      created = true;
      await writer.commitFiles(
        branch,
        head,
        p.files.map((f) => ({ path: f.path, text: f.proposed })),
        commitMessage(p.agentName, p.id),
      );
      const cases = await this.cases.find({ where: { proposalId: id }, order: { id: 'ASC' } });
      const replays = (await this.replays.find({ where: { proposalId: id } })).map(toReplayDto);
      const prUrl = await writer.openPullRequest({
        title: pullRequestTitle(p.agentName),
        head: branch,
        base,
        body: pullRequestBody({
          proposalId: p.id,
          agentName: p.agentName,
          rationale: p.rationale,
          baseCommit: p.baseCommit,
          reviewIds: cases.map((c) => c.reviewId),
          diagnoses: cases.map((c) => ({ reviewId: c.reviewId, diagnosis: c.diagnosis })),
          replays,
        }),
      });
      await this.proposals.update({ id }, { status: 'published', branch, prUrl });
      return { branch, prUrl };
    } catch (err) {
      // Release the claim so the admin can retry; remove the branch this call created.
      if (created) await writer.deleteBranch(branch).catch(() => undefined);
      await this.proposals.update({ id, status: 'ready' }, { branch: null });
      if (err instanceof GitHubWriteError) throw new BadGatewayException(err.message);
      throw err;
    }
  }
}
