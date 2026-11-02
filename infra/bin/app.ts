#!/usr/bin/env node
import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import { AppStack } from '../lib/app-stack';
import { appStackName, dataStackName, resolveRegion, resolveStage } from '../lib/config';
import { DataStack } from '../lib/data-stack';

const app = new cdk.App();
const config = resolveStage(app.node.tryGetContext('stage'));
// Account is intentionally left to the CLI's active credentials (env-agnostic on account) so
// synth needs no AWS lookups such as availability zones.
const env = { region: resolveRegion() };
const repoRoot = path.resolve(__dirname, '..', '..');

const data = new DataStack(app, dataStackName(config.stage), { env, config });
new AppStack(app, appStackName(config.stage), {
  env,
  config,
  data,
  apiBundlePath: path.join(repoRoot, 'infra', 'build', 'api-bundle.zip'),
  webDistPath: path.join(repoRoot, 'apps', 'web', 'dist'),
});
