export const SUPPORTED_STAGES = ['dev'] as const;
export type Stage = (typeof SUPPORTED_STAGES)[number];

export const PROJECT_NAME = 'langchain-example';
export const PROJECT_PASCAL = 'LangchainExample';
/** Database created on RDS. */
export const DB_NAME = 'langchain_example';

export const resourcePrefix = (stage: Stage) => `${PROJECT_NAME}-${stage}`;
export const dataStackName = (stage: Stage) => `${PROJECT_PASCAL}-${stage}-Data`;
export const appStackName = (stage: Stage) => `${PROJECT_PASCAL}-${stage}-App`;

/** Region of the deployment: AWS_REGION from the environment (root .env). */
export function resolveRegion(env: NodeJS.ProcessEnv = process.env): string {
  const region = env.AWS_REGION?.trim();
  if (!region)
    throw new Error('AWS_REGION is not set (set it in the environment or the root .env)');
  return region;
}

export interface StageConfig {
  stage: Stage;
  dbInstanceClass: string; // e.g. t4g.micro
  dbAllocatedStorageGb: number;
  dbBackupDays: number;
  redisNodeType: string;
  ebInstanceType: string;
  ebMinSize: number;
  ebMaxSize: number;
  logRetentionDays: number;
  /**
   * Pinned EB platform. Changing it replaces the environment (not possible while it has a custom
   * name); minor upgrades are done by EB managed updates. Override with -c ebSolutionStack=...
   */
  ebSolutionStack: string;
}

const CONFIGS: Record<Stage, StageConfig> = {
  dev: {
    stage: 'dev',
    dbInstanceClass: 't4g.micro',
    dbAllocatedStorageGb: 20,
    dbBackupDays: 1,
    redisNodeType: 'cache.t4g.micro',
    ebInstanceType: 't3.small',
    ebMinSize: 1,
    ebMaxSize: 2,
    logRetentionDays: 14,
    ebSolutionStack: '64bit Amazon Linux 2023 v6.11.9 running Node.js 22',
  },
};

export function resolveStage(value: unknown): StageConfig {
  const stage = (value ?? 'dev') as string;
  if (!(SUPPORTED_STAGES as readonly string[]).includes(stage)) {
    throw new Error(
      `Unsupported stage "${stage}". Supported stages: ${SUPPORTED_STAGES.join(', ')}`,
    );
  }
  return CONFIGS[stage as Stage];
}

/**
 * Optional, non-secret API settings copied from the deploy environment (root .env or
 * infra/.env.<stage>) to the Elastic Beanstalk environment properties when set. Same names and
 * meaning as /.env.example. Intentionally absent: AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY (the
 * instance role is used) and the local-only DB_*, REDIS_*, NODE_ENV, AUTH_ENABLED and ports.
 */
export const OPTIONAL_API_ENV = [
  'OIDC_COGNITO_DOMAIN',
  'OIDC_SCOPE',
  'ADMIN_GROUP',
  'MODEL_BASE_URL',
  'CONFIG_SOURCE',
  'CONFIG_REF',
  'CONFIG_GITHUB_API_URL',
  'EVOLUTION_MODEL',
  'EVOLUTION_MAX_TOKENS',
  'APP_VERSION',
] as const;
