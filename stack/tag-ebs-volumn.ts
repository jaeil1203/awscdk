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

export class TagEBSHandleStack extends BaseStack {

  constructor(scope: cdk.Construct, id: string, props: StackProps) {
    super(scope, id, props);
    
    const env = AppContext.getInstance().env;
  
    // role for auto-tagging task
    const roleName = `TagEBSHandleLambdaRole-${env}`
    const lambdaRole = new iam.Role(this, 'lambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      roleName: roleName,
      managedPolicies: [
        iam.ManagedPolicy.fromManagedPolicyArn(this, 'AWSLambdaBasicExecutionRole', 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'),
        iam.ManagedPolicy.fromManagedPolicyArn(this, 'AWSLambdaVPCAccessExecutionRole', 'arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole'),
        iam.ManagedPolicy.fromManagedPolicyArn(this, 'SecretsManagerReadWrite', 'arn:aws:iam::aws:policy/SecretsManagerReadWrite'),
      ]
    });
    
    const policyParamStoreReadOnlyAccess = new iam.Policy(this, 'AWSEC2CreateTags', {
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'ec2:CreateTags' // add inline policy to create tags
          ],
          resources: [`*`]
        })
      ]
    })
    lambdaRole.attachInlinePolicy(policyParamStoreReadOnlyAccess)

    // add lambda function 
    const TagEBSHanlder = new lambda.Function(this, 'TagEBSHandler', {
      code: lambda.Code.fromAsset('lambda/tagging_ebs_handler'),
      handler: 'handler.lambda_handler',
      runtime: lambda.Runtime.PYTHON_3_8,
      vpc: props.vpc,
      vpcSubnets: props.vpc.selectSubnets({
        subnetType: ec2.SubnetType.PRIVATE
      }),
      role : lambdaRole,
      environment: {
        APP_NAME: AppContext.getInstance().appName,
        ENV: AppContext.getInstance().env
      },
    });
    
    // add cloudwatch rule triggering createVolume for EC2
    const cloudwatchEventRule = new events.Rule(this, 'CloudwatchEventRule-EBS', {
      eventPattern: {
        source: ['aws.ec2'],
        detail: {
          event: [`createVolume`],
        },
        detailType: ["EBS Volume Notification"]
      }
    });

    // auto tag for the event rule    
    cdk.Tags.of(cloudwatchEventRule).add('map-migrated', 'd-xxxxxxxxxxxxxxxxxxxx');
    cdk.Tags.of(cloudwatchEventRule).add('Project', AppContext.getInstance().appName);
    cdk.Tags.of(cloudwatchEventRule).add('DeployEnvironment', AppContext.getInstance().env);
    cdk.Tags.of(cloudwatchEventRule).add('Name', `cmps-ErrorHandle`);
    
    // attch lambda to cloudwatch rule
    cloudwatchEventRule.addTarget(new events_targets.LambdaFunction(TagEBSHanlder));

  }
}