import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elasticache from 'aws-cdk-lib/aws-elasticache';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import { DB_NAME, resourcePrefix, StageConfig } from './config';

export interface DataStackProps extends cdk.StackProps {
  config: StageConfig;
}

/** Network, data stores, buckets and secrets. Survives App stack rebuilds. */
export class DataStack extends cdk.Stack {
  readonly vpc: ec2.Vpc;
  readonly appSecurityGroup: ec2.SecurityGroup;
  readonly albSecurityGroup: ec2.SecurityGroup;
  readonly dbInstance: rds.DatabaseInstance;
  readonly dbPasswordSecret: secretsmanager.Secret;
  readonly redisEndpoint: string;
  readonly redisPort: string;
  readonly secrets: Record<
    'ORIGIN_VERIFY_SECRET' | 'MODEL_API_KEY' | 'CONFIG_GITHUB_TOKEN',
    secretsmanager.Secret
  > &
    // Only when SETTINGS_ENCRYPTION_KEY is set for the deploy: enables storing the GitHub token
    // from the Settings page.
    Partial<Record<'SETTINGS_ENCRYPTION_KEY', secretsmanager.Secret>>;

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);
    const { config } = props;
    const prefix = resourcePrefix(config.stage);

    // --- Network ---------------------------------------------------------
    this.vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2,
      // No NAT gateway: the account's Elastic IP quota is exhausted and a NAT costs ~USD 33/month.
      // Backend instances sit in the public subnets with a public IP (inbound only from the ALB SG).
      natGateways: 0,
      subnetConfiguration: [
        { name: 'public', subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: 'data', subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
    });

    // Security groups live here (not in the App stack) so data-tier rules can
    // reference them without a cross-stack dependency cycle.
    this.appSecurityGroup = new ec2.SecurityGroup(this, 'AppSg', {
      vpc: this.vpc,
      description: 'Elastic Beanstalk instances',
    });
    this.albSecurityGroup = new ec2.SecurityGroup(this, 'AlbSg', {
      vpc: this.vpc,
      description: 'Elastic Beanstalk ALB (CloudFront origin-facing only)',
    });
    // Resolved by scripts/aws.sh with the AWS CLI (or CLOUDFRONT_PREFIX_LIST_ID) and passed as
    // context, so synth needs no AWS lookups.
    const prefixListId: string | undefined = this.node.tryGetContext('cloudFrontPrefixListId');
    if (!prefixListId) {
      throw new Error(
        'Missing context "cloudFrontPrefixListId" (CloudFront origin-facing managed prefix list id)',
      );
    }
    this.albSecurityGroup.addIngressRule(
      ec2.Peer.prefixList(prefixListId),
      ec2.Port.tcp(80),
      'CloudFront origin-facing',
    );
    this.appSecurityGroup.addIngressRule(this.albSecurityGroup, ec2.Port.tcp(80), 'From ALB');

    // --- Secrets ---------------------------------------------------------
    const generated = (name: string, length = 40) =>
      new secretsmanager.Secret(this, name, {
        secretName: `${prefix}/${name}`,
        generateSecretString: { passwordLength: length, excludePunctuation: true },
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      });
    // Operator-supplied: created with a placeholder, real value written by the deploy script.
    const provided = (name: string) =>
      new secretsmanager.Secret(this, name, {
        secretName: `${prefix}/${name}`,
        secretStringValue: cdk.SecretValue.unsafePlainText('REPLACE_ME'),
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      });

    this.dbPasswordSecret = generated('DB_PASSWORD', 32);
    this.secrets = {
      ORIGIN_VERIFY_SECRET: generated('ORIGIN_VERIFY_SECRET'),
      MODEL_API_KEY: provided('MODEL_API_KEY'),
      CONFIG_GITHUB_TOKEN: provided('CONFIG_GITHUB_TOKEN'),
      ...(process.env.SETTINGS_ENCRYPTION_KEY?.trim()
        ? { SETTINGS_ENCRYPTION_KEY: provided('SETTINGS_ENCRYPTION_KEY') }
        : {}),
    };

    // --- PostgreSQL (pgvector is enabled by the init migration) -----
    const dbSg = new ec2.SecurityGroup(this, 'DbSg', {
      vpc: this.vpc,
      description: 'RDS PostgreSQL',
    });
    dbSg.addIngressRule(this.appSecurityGroup, ec2.Port.tcp(5432), 'From backend');
    this.dbInstance = new rds.DatabaseInstance(this, 'Postgres', {
      engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_16 }),
      instanceType: new ec2.InstanceType(config.dbInstanceClass),
      vpc: this.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [dbSg],
      credentials: rds.Credentials.fromPassword('postgres', this.dbPasswordSecret.secretValue),
      databaseName: DB_NAME,
      allocatedStorage: config.dbAllocatedStorageGb,
      storageType: rds.StorageType.GP3,
      storageEncrypted: true,
      multiAz: false,
      publiclyAccessible: false,
      backupRetention: cdk.Duration.days(config.dbBackupDays),
      deletionProtection: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // --- ElastiCache Redis 7 (health check; app cache) -------------------
    const redisSg = new ec2.SecurityGroup(this, 'RedisSg', {
      vpc: this.vpc,
      description: 'ElastiCache Redis',
    });
    redisSg.addIngressRule(this.appSecurityGroup, ec2.Port.tcp(6379), 'From backend');
    const redisSubnets = new elasticache.CfnSubnetGroup(this, 'RedisSubnets', {
      description: `${prefix} redis`,
      subnetIds: this.vpc.selectSubnets({ subnetType: ec2.SubnetType.PRIVATE_ISOLATED }).subnetIds,
    });
    const redis = new elasticache.CfnReplicationGroup(this, 'Redis', {
      replicationGroupDescription: `${prefix} redis`,
      engine: 'redis',
      engineVersion: '7.1',
      cacheNodeType: config.redisNodeType,
      numCacheClusters: 1,
      automaticFailoverEnabled: false,
      multiAzEnabled: false,
      atRestEncryptionEnabled: true,
      // TLS without AUTH token: the API connects with REDIS_TLS=true and no password.
      transitEncryptionEnabled: true,
      cacheSubnetGroupName: redisSubnets.ref,
      securityGroupIds: [redisSg.securityGroupId],
    });
    redis.addDependency(redisSubnets);
    this.redisEndpoint = redis.attrPrimaryEndPointAddress;
    this.redisPort = redis.attrPrimaryEndPointPort;

    new cdk.CfnOutput(this, 'DbEndpoint', { value: this.dbInstance.dbInstanceEndpointAddress });
    new cdk.CfnOutput(this, 'RedisEndpoint', { value: this.redisEndpoint });
  }
}
