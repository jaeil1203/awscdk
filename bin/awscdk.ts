#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { AppContext } from '../lib/app-context';
import { VpcStack } from '../stack/vpc-stack';
import { ResourceStack } from '../stack/resource-stack';

const app = new cdk.App();
const env = app.node.tryGetContext("env")==undefined?'dev':app.node.tryGetContext("env");

AppContext.getInstance().initialize({
  applicationName: 'myApp',
  deployEnvironment: env
});

const vpcStack = new VpcStack(app, `VpcStack${env}`);
const resourceStack = new ResourceStack(app, `ResourceStack${env}`, {
  vpc: vpcStack.vpc,
});
