/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this
 * software and associated documentation files (the "Software"), to deal in the Software
 * without restriction, including without limitation the rights to use, copy, modify,
 * merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
 * PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import * as cdk from '@aws-cdk/core';
import { BaseStack } from '../lib/base-stack';
import { AppContext } from '../lib/app-context';
import * as lambda from '@aws-cdk/aws-lambda';
import * as events from "@aws-cdk/aws-events";
import * as events_targets from "@aws-cdk/aws-events-targets";
import * as ec2 from '@aws-cdk/aws-ec2';
import * as iam from '@aws-cdk/aws-iam';

interface StackProps extends cdk.StackProps {
  vpc: ec2.IVpc
}

export class BatchErrorHandleStack extends BaseStack {

  constructor(scope: cdk.Construct, id: string, props: StackProps) {
    super(scope, id, props);
    
    const env = AppContext.getInstance().env;
  
    // create the role for error handle lambda funtion
    const roleName = `ErrorHandleLambdaRole-${env}`
    const lambdaRole = new iam.Role(this, 'lambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      roleName: roleName,
      managedPolicies: [
        iam.ManagedPolicy.fromManagedPolicyArn(this, 'AWSLambdaBasicExecutionRole', 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'),
        iam.ManagedPolicy.fromManagedPolicyArn(this, 'AWSLambdaVPCAccessExecutionRole', 'arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole'),
        iam.ManagedPolicy.fromManagedPolicyArn(this, 'SecretsManagerReadWrite', 'arn:aws:iam::aws:policy/SecretsManagerReadWrite'),
        iam.ManagedPolicy.fromManagedPolicyArn(this, 'CloudWatchLogsFullAccess', 'arn:aws:iam::aws:policy/CloudWatchLogsFullAccess'),      ]
    });

    // add lambda
    const batchSlackHanlder = new lambda.Function(this, 'BatchSlackHandler', {
      code: lambda.Code.fromAsset('lambda/batch_debug_handler'),
      handler: 'handler.lambda_handler',
      runtime: lambda.Runtime.PYTHON_3_8,
      vpc: props.vpc,
      vpcSubnets: props.vpc.selectSubnets({
        subnetType: ec2.SubnetType.PRIVATE
      }),
      role : lambdaRole,
      environment: {
        ENV: env,
        region: this.region
      },
    });

    // add cloudwatch rule according to env variable    
    const BatchEventRule = new events.Rule(this, `BatchErrorNotificationRule-${env}`, {
      eventPattern: {
        source: ['aws.batch'],
        detail: {
          jobQueue: [
            `arn:aws:batch:ap-northeast-2:${this.account}:job-queue/JQ-${env}-test`,
          ],
          status: [`FAILED`], // if failed
        }
      },
      targets: [new events_targets.LambdaFunction(batchSlackHanlder)] // connect slack handler
    });
    
    cdk.Tags.of(BatchEventRule).add('map-migrated', 'd-server-xxxxxxxxxxxx');
    cdk.Tags.of(BatchEventRule).add('Project', AppContext.getInstance().appName);
    cdk.Tags.of(BatchEventRule).add('DeployEnvironment', AppContext.getInstance().env);
    cdk.Tags.of(BatchEventRule).add('Name', `encsys-ErrorHandle`);
  }
}