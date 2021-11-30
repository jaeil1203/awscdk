#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { AppContext } from '../lib/app-context';
import { VpcStack } from '../stack/vpc-stack';
import { ResourceStack } from '../stack/resource-stack';
import { TagEBSHandleStack } from '../stack/tag-ebs-volumn';
import { ScheduleWorksHandleStack } from '../stack/schedule-works-stack';
import { BatchStack } from '../stack/batch-stack';
import { TestAPILambdaStack } from '../stack/restapi-stack'
import { CicdStack } from '../stack/cicd-stack'
import * as env_const from '../stack/const'

const app = new cdk.App();
const env = app.node.tryGetContext("env")==undefined?'dev':app.node.tryGetContext("env");

AppContext.getInstance().initialize({
  applicationName: env_const.appName,
  deployEnvironment: env
});

const vpcStack = new VpcStack(app, `VpcStack${env}`);
const resourceStack = new ResourceStack(app, `ResourceStack${env}`, {
  vpc: vpcStack.vpc,
});

new TagEBSHandleStack(app, `TagEBSHandleStack${env}`, {
  vpc: vpcStack.vpc,
});

new ScheduleWorksHandleStack(app, `ScheduleWorksHandleStack${env}`, {
  vpc: vpcStack.vpc
});

new BatchStack(app, `BatchStack${env}`, {
  vpc: vpcStack.vpc
});

new TestAPILambdaStack(app, `TestAPILambdaStack${env}`, {
  vpc: vpcStack.vpc
});

new CicdStack(app, `CicdStack${env}`, {
  vpc: vpcStack.vpc
});
