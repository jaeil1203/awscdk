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
import * as lambda from '@aws-cdk/aws-lambda';
import * as events from "@aws-cdk/aws-events";
import * as events_targets from "@aws-cdk/aws-events-targets";
import * as ec2 from '@aws-cdk/aws-ec2';
import * as iam from '@aws-cdk/aws-iam';
import { BaseStack } from '../lib/base-stack';
import { AppContext } from '../lib/app-context';

interface StackProps extends cdk.StackProps {
    vpc: ec2.IVpc
}
  
export class ScheduleWorksHandleStack extends BaseStack {
  
  constructor(scope: cdk.Construct, id: string, props: StackProps) {
    super(scope, id, props);
    
    const env = AppContext.getInstance().env;
  
    const lambdaRole = new iam.Role(this, 'HandlelambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      roleName: `ScheduleHandleLambdaRole-${env}`,
      managedPolicies: [
        iam.ManagedPolicy.fromManagedPolicyArn(this, 'AWSLambdaBasicExecutionRole', 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'),
        iam.ManagedPolicy.fromManagedPolicyArn(this, 'AWSLambdaVPCAccessExecutionRole', 'arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole'),
        iam.ManagedPolicy.fromManagedPolicyArn(this, 'AmazonSSMManagedInstanceCore', 'arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore'),
      ]
    });

    this.createLambdaFunction(props.vpc, lambdaRole,"awsBatchPolling", '0/1', "*")
  }
  	
  private createLambdaFunction(vpc: ec2.IVpc, lambdaRole: iam.Role, postfix: string, Minutes: string, Hours: string)
  {
    const env = AppContext.getInstance().env;
    // add lambda
    const Hanlder = new lambda.Function(this, `ScheduleHandler${postfix}`, {
      code: lambda.Code.fromAsset(`lambda/schedule_works/${postfix}`),
      handler: 'handler.lambda_handler',
      runtime: lambda.Runtime.PYTHON_3_6,
      functionName: `${postfix}-${env}`,
      vpc: vpc,
      vpcSubnets: vpc.selectSubnets({
        subnetType: ec2.SubnetType.PRIVATE
      }),  
      /*    
      layers: [
        lambda.LayerVersion.fromLayerVersionAttributes(this, `TestLayer${postfix}`, {
          layerVersionArn: `arn:aws:lambda:ap-northeast-2:${this.account}:layer:ffmpeg:2`,
          compatibleRuntimes: [lambda.Runtime.PYTHON_3_6],
      })],
      */
      role : lambdaRole,
      /*
      environment: {
        ENV: 'dev',
        APP_NAME: AppContext.getInstance().appName,
      },
      */
    });
    
    // add cloudwatch rule    
    let cloudwatchEventRule
    if (Hours == '*'){
      cloudwatchEventRule = new events.Rule(this, `Cloudwatch-${postfix}-${env}`, {
        ruleName: `${postfix}-${env}-rule`,
        schedule: events.Schedule.cron({
          minute: Minutes
        })
      });
    }
    else{
      cloudwatchEventRule = new events.Rule(this, `Cloudwatch-${postfix}-${env}`, {
        ruleName: `${postfix}-${env}-rule`,
        schedule: events.Schedule.cron({
          minute: Minutes,
          hour: Hours,
        })
      });      
    }
    
    // attch lambda to cloudwatch rule
    cloudwatchEventRule.addTarget(new events_targets.LambdaFunction(Hanlder));
    
    cdk.Tags.of(cloudwatchEventRule).add('map-migrated', 'd-server-xxxxxxxxxxxxx');
    cdk.Tags.of(cloudwatchEventRule).add('Project', AppContext.getInstance().appName);
    cdk.Tags.of(cloudwatchEventRule).add('DeployEnvironment', AppContext.getInstance().env);
    cdk.Tags.of(cloudwatchEventRule).add('Name', `cmps-ErrorHandle`);
  }
}  