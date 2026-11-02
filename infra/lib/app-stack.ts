import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elasticbeanstalk from 'aws-cdk-lib/aws-elasticbeanstalk';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3assets from 'aws-cdk-lib/aws-s3-assets';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import { Construct } from 'constructs';
import { DB_NAME, OPTIONAL_API_ENV, resourcePrefix, StageConfig } from './config';
import { DataStack } from './data-stack';

export interface AppStackProps extends cdk.StackProps {
  config: StageConfig;
  data: DataStack;
  /** Zip produced by scripts/bundle-api.sh. */
  apiBundlePath: string;
  /** Built SPA (apps/web/dist). */
  webDistPath: string;
}

/** Elastic Beanstalk backend + S3/CloudFront frontend. */
export class AppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AppStackProps) {
    super(scope, id, props);
    const { config, data } = props;
    const prefix = resourcePrefix(config.stage);

    // --- IAM -------------------------------------------------------------
    const instanceRole = new iam.Role(this, 'InstanceRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AWSElasticBeanstalkWebTier'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
      ],
    });
    data.dbPasswordSecret.grantRead(instanceRole);
    Object.values(data.secrets).forEach((s) => s.grantRead(instanceRole));
    const instanceProfile = new iam.CfnInstanceProfile(this, 'InstanceProfile', {
      roles: [instanceRole.roleName],
    });

    const serviceRole = new iam.Role(this, 'ServiceRole', {
      assumedBy: new iam.ServicePrincipal('elasticbeanstalk.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSElasticBeanstalkEnhancedHealth',
        ),
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'AWSElasticBeanstalkManagedUpdatesCustomerRolePolicy',
        ),
      ],
    });

    // --- Elastic Beanstalk -----------------------------------------------
    const bundle = new s3assets.Asset(this, 'ApiBundle', { path: props.apiBundlePath });
    const ebApp = new elasticbeanstalk.CfnApplication(this, 'EbApp', { applicationName: prefix });
    const appVersion = new elasticbeanstalk.CfnApplicationVersion(this, 'EbAppVersion', {
      applicationName: ebApp.ref,
      sourceBundle: { s3Bucket: bundle.s3BucketName, s3Key: bundle.s3ObjectKey },
    });
    appVersion.addDependency(ebApp);

    const publicSubnets = data.vpc.selectSubnets({ subnetType: ec2.SubnetType.PUBLIC }).subnetIds;
    // No NAT gateway (Elastic IP quota): instances run in the public subnets with a public IP and
    // accept traffic only from the ALB security group.
    const appSubnets = publicSubnets;

    const opt = (namespace: string, optionName: string, value: string) => ({
      namespace,
      optionName,
      value,
    });
    const env = (name: string, value: string) =>
      opt('aws:elasticbeanstalk:application:environment', name, value);
    const secretEnv = (name: string, arn: string) =>
      opt('aws:elasticbeanstalk:application:environmentsecrets', name, arn);

    const optionSettings: elasticbeanstalk.CfnEnvironment.OptionSettingProperty[] = [
      // Platform / scaling
      opt('aws:elasticbeanstalk:environment', 'EnvironmentType', 'LoadBalanced'),
      opt('aws:elasticbeanstalk:environment', 'LoadBalancerType', 'application'),
      opt('aws:elasticbeanstalk:environment', 'ServiceRole', serviceRole.roleArn),
      opt('aws:autoscaling:launchconfiguration', 'IamInstanceProfile', instanceProfile.ref),
      opt(
        'aws:autoscaling:launchconfiguration',
        'SecurityGroups',
        data.appSecurityGroup.securityGroupId,
      ),
      opt('aws:ec2:instances', 'InstanceTypes', config.ebInstanceType),
      opt('aws:autoscaling:asg', 'MinSize', String(config.ebMinSize)),
      opt('aws:autoscaling:asg', 'MaxSize', String(config.ebMaxSize)),
      opt('aws:elasticbeanstalk:command', 'DeploymentPolicy', 'AllAtOnce'),
      // Network
      opt('aws:ec2:vpc', 'VPCId', data.vpc.vpcId),
      opt('aws:ec2:vpc', 'Subnets', appSubnets.join(',')),
      opt('aws:ec2:vpc', 'ELBSubnets', publicSubnets.join(',')),
      opt('aws:ec2:vpc', 'AssociatePublicIpAddress', 'true'),
      opt('aws:elbv2:loadbalancer', 'SecurityGroups', data.albSecurityGroup.securityGroupId),
      opt('aws:elbv2:loadbalancer', 'ManagedSecurityGroup', data.albSecurityGroup.securityGroupId),
      // Chat replies are SSE streams; keep idle connections open longer than CloudFront's origin timeout.
      opt('aws:elbv2:loadbalancer', 'IdleTimeout', '120'),
      // Health
      opt('aws:elasticbeanstalk:environment:process:default', 'HealthCheckPath', '/api/health'),
      opt('aws:elasticbeanstalk:environment:process:default', 'Port', '3000'),
      opt('aws:elasticbeanstalk:environment:process:default', 'Protocol', 'HTTP'),
      opt('aws:elasticbeanstalk:healthreporting:system', 'SystemType', 'enhanced'),
      opt('aws:elasticbeanstalk:cloudwatch:logs', 'StreamLogs', 'true'),
      opt(
        'aws:elasticbeanstalk:cloudwatch:logs',
        'RetentionInDays',
        String(config.logRetentionDays),
      ),
      // Plain configuration
      env('NODE_ENV', 'production'),
      env('API_PORT', '3000'),
      env('AUTH_ENABLED', 'true'),
      env('DB_HOST', data.dbInstance.dbInstanceEndpointAddress),
      env('DB_PORT', data.dbInstance.dbInstanceEndpointPort),
      env('DB_NAME', DB_NAME),
      env('DB_USER', 'postgres'),
      env('DB_SSL', 'true'),
      // RDS presents an AWS CA certificate that is not bundled; the database is private (SG-restricted).
      env('DB_SSL_REJECT_UNAUTHORIZED', 'false'),
      env('DB_MIGRATIONS_RUN', 'false'),
      env('REDIS_HOST', data.redisEndpoint),
      env('REDIS_PORT', data.redisPort),
      env('REDIS_TLS', 'true'),
      env('OIDC_ISSUER', process.env.OIDC_ISSUER ?? ''),
      env('OIDC_CLIENT_ID', process.env.OIDC_CLIENT_ID ?? ''),
      // Optional tuning/config from the deploy environment (only when non-empty)
      ...OPTIONAL_API_ENV.filter((name) => process.env[name]?.trim()).map((name) =>
        env(name, process.env[name]!.trim()),
      ),
      // Secrets (resolved by Elastic Beanstalk at instance start)
      secretEnv('DB_PASSWORD', data.dbPasswordSecret.secretArn),
      secretEnv('ORIGIN_VERIFY_SECRET', data.secrets.ORIGIN_VERIFY_SECRET.secretArn),
      secretEnv('MODEL_API_KEY', data.secrets.MODEL_API_KEY.secretArn),
      secretEnv('CONFIG_GITHUB_TOKEN', data.secrets.CONFIG_GITHUB_TOKEN.secretArn),
    ];

    const ebEnv = new elasticbeanstalk.CfnEnvironment(this, 'EbEnv', {
      environmentName: prefix,
      applicationName: ebApp.ref,
      solutionStackName: this.node.tryGetContext('ebSolutionStack') ?? config.ebSolutionStack,
      versionLabel: appVersion.ref,
      optionSettings,
    });
    ebEnv.addDependency(appVersion);

    // --- Web bucket + CloudFront -----------------------------------------
    const webBucket = new s3.Bucket(this, 'WebBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const apiOrigin = new origins.HttpOrigin(ebEnv.attrEndpointUrl, {
      protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
      // Chat replies stream and may be silent while the agent works; 60 s is the default maximum.
      readTimeout: cdk.Duration.seconds(60),
      customHeaders: {
        // Resolved by CloudFormation at deploy time (dynamic reference).
        'X-Origin-Verify': data.secrets.ORIGIN_VERIFY_SECRET.secretValue.unsafeUnwrap(),
      },
    });

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: prefix,
      defaultRootObject: 'index.html',
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(webBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      additionalBehaviors: {
        '/api/*': {
          origin: apiOrigin,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          // Forwards the viewer Host and CloudFront-Forwarded-Proto headers.
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_AND_CLOUDFRONT_2022,
        },
      },
    });

    new s3deploy.BucketDeployment(this, 'WebDeployment', {
      sources: [s3deploy.Source.asset(path.resolve(props.webDistPath))],
      destinationBucket: webBucket,
      distribution,
      distributionPaths: ['/*'],
      prune: true,
    });

    new cdk.CfnOutput(this, 'CloudFrontUrl', {
      value: `https://${distribution.distributionDomainName}`,
    });
    new cdk.CfnOutput(this, 'EbEnvironmentName', { value: ebEnv.ref });
    new cdk.CfnOutput(this, 'WebBucketName', { value: webBucket.bucketName });
  }
}
