import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { AppStack } from '../lib/app-stack';
import { DB_NAME, resolveRegion, resolveStage } from '../lib/config';
import { DataStack } from '../lib/data-stack';

function build() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'infra-test-'));
  const bundle = path.join(tmp, 'api-bundle.zip');
  fs.writeFileSync(bundle, 'zip');
  const web = path.join(tmp, 'web');
  fs.mkdirSync(web);
  fs.writeFileSync(path.join(web, 'index.html'), '<html></html>');

  const app = new cdk.App({ context: { cloudFrontPrefixListId: 'pl-12345678' } });
  const config = resolveStage('dev');
  const env = { region: 'us-east-2' };
  const data = new DataStack(app, 'Data', { env, config });
  const appStack = new AppStack(app, 'App', {
    env,
    config,
    data,
    apiBundlePath: bundle,
    webDistPath: web,
  });
  return { data: Template.fromStack(data), app: Template.fromStack(appStack) };
}

describe('region', () => {
  it('comes from AWS_REGION', () =>
    expect(resolveRegion({ AWS_REGION: 'eu-west-1' })).toBe('eu-west-1'));
  it('is required', () => expect(() => resolveRegion({})).toThrow(/AWS_REGION/));
});

describe('stages', () => {
  it('defaults to dev', () => expect(resolveStage(undefined).stage).toBe('dev'));
  it('rejects unsupported stages', () =>
    expect(() => resolveStage('prod')).toThrow(/Supported stages: dev/));
});

describe('Data stack', () => {
  const { data } = build();

  it('keeps RDS private, encrypted, PostgreSQL 16', () => {
    data.hasResourceProperties('AWS::RDS::DBInstance', {
      Engine: 'postgres',
      EngineVersion: '16',
      PubliclyAccessible: false,
      StorageEncrypted: true,
      BackupRetentionPeriod: 1,
      DBName: DB_NAME,
    });
  });

  it('configures Redis 7 with encryption in transit and no cluster mode', () => {
    data.hasResourceProperties('AWS::ElastiCache::ReplicationGroup', {
      Engine: 'redis',
      NumCacheClusters: 1,
      TransitEncryptionEnabled: true,
      AtRestEncryptionEnabled: true,
    });
  });

  it('only admits the backend SG to the data tier', () => {
    data.hasResourceProperties('AWS::EC2::SecurityGroupIngress', { FromPort: 5432, ToPort: 5432 });
    data.hasResourceProperties('AWS::EC2::SecurityGroupIngress', { FromPort: 6379, ToPort: 6379 });
  });

  it('limits ALB ingress to the CloudFront prefix list', () => {
    data.hasResourceProperties('AWS::EC2::SecurityGroupIngress', {
      SourcePrefixListId: 'pl-12345678',
      FromPort: 80,
    });
  });

  it('has no asset bucket and names resources after this project', () => {
    expect(Object.keys(data.findResources('AWS::S3::Bucket'))).toHaveLength(0);
    const names = Object.values(data.findResources('AWS::SecretsManager::Secret'))
      .map((r: any) => r.Properties.Name)
      .sort();
    expect(names).toEqual([
      'langchain-example-dev/CONFIG_GITHUB_TOKEN',
      'langchain-example-dev/DB_PASSWORD',
      'langchain-example-dev/MODEL_API_KEY',
      'langchain-example-dev/ORIGIN_VERIFY_SECRET',
    ]);
  });
});

describe('App stack', () => {
  const { app } = build();

  it('runs a load-balanced EB environment with /api/health', () => {
    for (const [OptionName, Value] of [
      ['EnvironmentType', 'LoadBalanced'],
      ['HealthCheckPath', '/api/health'],
      ['AssociatePublicIpAddress', 'true'],
      ['DB_SSL', 'true'],
      ['REDIS_TLS', 'true'],
      ['AUTH_ENABLED', 'true'],
      ['API_PORT', '3000'],
      ['IdleTimeout', '120'],
    ]) {
      app.hasResourceProperties('AWS::ElasticBeanstalk::Environment', {
        OptionSettings: Match.arrayWith([Match.objectLike({ OptionName, Value })]),
      });
    }
  });

  it('injects secrets via Secrets Manager, not plain values', () => {
    const envs = app.findResources('AWS::ElasticBeanstalk::Environment');
    const options: any[] = Object.values(envs)[0].Properties.OptionSettings;
    const secretNames = options
      .filter((o) => o.Namespace === 'aws:elasticbeanstalk:application:environmentsecrets')
      .map((o) => o.OptionName)
      .sort();
    expect(secretNames).toEqual([
      'CONFIG_GITHUB_TOKEN',
      'DB_PASSWORD',
      'MODEL_API_KEY',
      'ORIGIN_VERIFY_SECRET',
    ]);
    expect(
      options.find((o) => o.OptionName === 'DB_PASSWORD' && o.Namespace.endsWith(':environment')),
    ).toBeUndefined();
  });

  it('serves the SPA from S3 and /api/* from the origin without caching', () => {
    app.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        CacheBehaviors: [
          Match.objectLike({ PathPattern: '/api/*', ViewerProtocolPolicy: 'redirect-to-https' }),
        ],
      }),
    });
    const dist: any = Object.values(app.findResources('AWS::CloudFront::Distribution'))[0];
    const origins: any[] = dist.Properties.DistributionConfig.Origins;
    expect(origins.some((o) => o.OriginCustomHeaders?.[0]?.HeaderName === 'X-Origin-Verify')).toBe(
      true,
    );
  });

  it('passes optional settings through only when set', () => {
    process.env.MODEL_BASE_URL = 'https://gateway.example';
    try {
      const { app: withOpt } = build();
      withOpt.hasResourceProperties('AWS::ElasticBeanstalk::Environment', {
        OptionSettings: Match.arrayWith([
          Match.objectLike({ OptionName: 'MODEL_BASE_URL', Value: 'https://gateway.example' }),
        ]),
      });
    } finally {
      delete process.env.MODEL_BASE_URL;
    }
    const opts: any[] = Object.values(app.findResources('AWS::ElasticBeanstalk::Environment'))[0]
      .Properties.OptionSettings;
    expect(opts.some((o) => o.OptionName === 'MODEL_BASE_URL')).toBe(false);
    expect(opts.some((o) => o.OptionName === 'AWS_ACCESS_KEY_ID')).toBe(false);
    expect(
      opts.some((o) => /^(DATABASE_|COGNITO_|TWILIO|POSTMARK|VOYAGE)/.test(o.OptionName)),
    ).toBe(false);
  });

  it('grants no Cognito or S3 access to the instances', () => {
    const all = app.findResources('AWS::IAM::Policy');
    const instance = Object.entries(all).filter(([id]) => id.startsWith('InstanceRole'));
    expect(instance).toHaveLength(1);
    expect(JSON.stringify(instance)).not.toMatch(/cognito-idp|s3:/);
  });

  it('uploads the web bundle and invalidates CloudFront', () => {
    app.hasResourceProperties('Custom::CDKBucketDeployment', { DistributionPaths: ['/*'] });
  });
});
