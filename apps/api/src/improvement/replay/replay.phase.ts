import type {
  ImprovementReplay as ReplayDto,
  ReplayKind,
  ReplayOutput,
  ReplayVerdict,
} from '@app/shared';
import { In, type Repository } from 'typeorm';
import { fromRows } from '../../agent-config/agent-config.loader';
import { AgentConfigService } from '../../agent-config/agent-config.service';
import type { ConfigFiles } from '../../agent-config/agent-config.types';
import type { SnapshotRow } from '../../agent-config/snapshot.store';
import { assembleConfig } from '../../agent-config/validate';
import { AgentConfigSnapshot } from '../../database/entities/agent-config-snapshot.entity';
import { ChatLogMessage } from '../../database/entities/chat-log-message.entity';
import { ChatLogReview } from '../../database/entities/chat-log-review.entity';
import { ImprovementReplay } from '../../database/entities/improvement-replay.entity';
import type { StructuredCaller } from '../evolution.model';
import { Limiter } from '../limiter';
import type { ToolInfo } from '../tool-inventory';
import { judgeReplay } from './judge';
import { recordedResults } from './recorded-mcp';
import { historyFor, memoriesFor, replayTurn, type ReplayRunner } from './replay';

/** Replays that run at the same time within one proposal. */
const CONCURRENCY = 3;

export interface ReplayTarget {
  review: ChatLogReview;
  message: ChatLogMessage;
  /** The diagnosis is `routing`: both runs start at the selector. */
  routing: boolean;
}

export interface ReplayPhaseDeps {
  messages: Repository<ChatLogMessage>;
  reviews: Repository<ChatLogReview>;
  snapshots: Repository<AgentConfigSnapshot>;
  replays: Repository<ImprovementReplay>;
  run: ReplayRunner;
  caller: StructuredCaller;
  knownLocalTools: readonly string[];
}

export interface ReplayPhaseInput {
  proposalId: string;
  agentName: string;
  targets: ReplayTarget[];
  proposed: ConfigFiles;
  identity: { hash: string; version: string; source: string };
  inventory: ToolInfo[];
}

const toRow = (e: AgentConfigSnapshot): SnapshotRow => ({
  hash: e.hash,
  agentName: e.agentName,
  version: e.version,
  source: e.source,
  definition: e.definition as never,
  settings: e.settings as never,
  contentHash: e.contentHash ?? '',
});

/**
 * Replays the proposal's target reviews and every Good message review of the same agent under the
 * config each event ran under and under the proposed config, judges each pair and stores the
 * result. One failing replay is stored as an error and does not stop the others.
 */
export class ReplayPhase {
  constructor(private readonly deps: ReplayPhaseDeps) {}

  private readonly sessions = new Map<string, Promise<ChatLogMessage[]>>();
  private readonly oldConfigs = new Map<string, Promise<AgentConfigService | null>>();

  private events(sessionId: string) {
    let p = this.sessions.get(sessionId);
    if (!p) {
      p = this.deps.messages.find({ where: { sessionId }, order: { seq: 'ASC' } });
      this.sessions.set(sessionId, p);
    }
    return p;
  }

  /** The config the event ran under, rebuilt from its snapshot rows; null when not stored. */
  private oldConfig(hash: string) {
    let p = this.oldConfigs.get(hash);
    if (!p) {
      p = this.deps.snapshots
        .find({ where: { hash } })
        .then((rows) =>
          rows.length ? new AgentConfigService(fromRows(rows.map(toRow), rows[0].version)) : null,
        );
      this.oldConfigs.set(hash, p);
    }
    return p;
  }

  /** Good message reviews of the agent, most recent first. */
  async regressionTargets(agentName: string, exclude: Set<string>): Promise<ReplayTarget[]> {
    const good = (
      await this.deps.reviews.find({ where: { rating: 'good' }, order: { createdAt: 'DESC' } })
    ).filter((r) => r.messageId && !exclude.has(r.id));
    if (!good.length) return [];
    const messages = await this.deps.messages.find({
      where: { id: In(good.map((r) => r.messageId as string)) },
    });
    const byId = new Map(messages.map((m) => [m.id, m]));
    return good.flatMap((review) => {
      const message = byId.get(review.messageId as string);
      return message && message.agentName === agentName
        ? [{ review, message, routing: false }]
        : [];
    });
  }

  async run(input: ReplayPhaseInput): Promise<void> {
    const proposedConfig = new AgentConfigService(
      assembleConfig(input.proposed, input.identity, this.deps.knownLocalTools),
    );
    const regression = await this.regressionTargets(
      input.agentName,
      new Set(input.targets.map((t) => t.review.id)),
    );
    const jobs: { kind: ReplayKind; target: ReplayTarget }[] = [
      ...input.targets.map((target) => ({ kind: 'target' as const, target })),
      ...regression.map((target) => ({ kind: 'regression' as const, target })),
    ];
    const limiter = new Limiter(CONCURRENCY);
    await Promise.all(
      jobs.map((job) =>
        limiter.run(async () => {
          const row = await this.one(job.kind, job.target, proposedConfig, input.inventory).catch(
            (err: unknown) => ({
              old: null,
              new: null,
              verdict: null,
              error: err instanceof Error ? err.message : String(err),
            }),
          );
          await this.deps.replays.save(
            this.deps.replays.create({
              proposalId: input.proposalId,
              reviewId: job.target.review.id,
              kind: job.kind,
              ...row,
            }),
          );
        }),
      ),
    );
  }

  private async one(
    kind: ReplayKind,
    { review, message, routing }: ReplayTarget,
    proposedConfig: AgentConfigService,
    inventory: ToolInfo[],
  ): Promise<{ old: ReplayOutput; new: ReplayOutput; verdict: ReplayVerdict; error: null }> {
    if (!message.agentConfigHash) throw new Error('The reviewed event has no config hash');
    const old = await this.oldConfig(message.agentConfigHash);
    if (!old) throw new Error('The config snapshot the event ran under is not stored');

    const events = await this.events(message.sessionId);
    const history = historyFor(events, message.turnId);
    if (!history.length) throw new Error('The reviewed turn has no user message');
    const entryAgent = routing ? 'selector' : (message.agentName ?? 'selector');
    const common = {
      entryAgent,
      history,
      recorded: recordedResults(events),
      inventory,
      memories: memoriesFor(events, message.turnId),
    };

    const oldOut = await replayTurn(this.deps.run, { ...common, config: old });
    const newOut = await replayTurn(this.deps.run, { ...common, config: proposedConfig });
    const verdict = await judgeReplay(this.deps.caller, {
      kind,
      userMessage: history[history.length - 1].content,
      review: { comment: review.comment, expectedResult: review.expectedResult },
      old: oldOut,
      new: newOut,
    });
    return { old: oldOut, new: newOut, verdict, error: null };
  }
}

export const toReplayDto = (r: ImprovementReplay): ReplayDto => ({
  id: r.id,
  reviewId: r.reviewId,
  kind: r.kind,
  old: r.old,
  new: r.new,
  verdict: r.verdict,
  error: r.error,
});
