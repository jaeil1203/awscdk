#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { AppContext } from '../lib/app-context';
import { VpcStack } from '../stack/vpc-stack';
import { ResourceStack } from '../stack/resource-stack';
import { TagEBSHandleStack } from '../stack/tag-ebs-volumn';
import { ScheduleWorksHandleStack } from '../stack/schedule-works-stack';
import { TestAPILambdaStack } from '../stack/restapi-stack'

const app = new cdk.App();
const env = app.node.tryGetContext("env")==undefined?'dev':app.node.tryGetContext("env");

AppContext.getInstance().initialize({
  applicationName: 'skt',
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

new TestAPILambdaStack(app, `TestAPILambdaStack${env}`, {
  vpc: vpcStack.vpc
});
