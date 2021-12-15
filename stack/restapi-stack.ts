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
import * as ec2 from '@aws-cdk/aws-ec2';
import * as apigw from '@aws-cdk/aws-apigateway';
import * as iam from '@aws-cdk/aws-iam';
import * as env_const from './const'
import { BaseStack } from '../lib/base-stack';
import { AppContext } from '../lib/app-context';


interface StackProps extends cdk.StackProps {
    vpc: ec2.IVpc
}
  
export class TestAPILambdaStack extends BaseStack {
  
  constructor(scope: cdk.Construct, id: string, props: StackProps) {
    super(scope, id, props);

    // https://jhb.kr/376
    const test = this.createLambdaFunction(props.vpc, "awsBatchPolling")

    const gw = new apigw.LambdaRestApi(this, 'Endpoint', { 
        handler: test,        
    });
  }
  	
  private createLambdaRole(account: string, env: string, appName: string, region: string) {
    
    const roleName = `JobTriggerRestAPILambdaRole-${env}`
    const lambdaRole = new iam.Role(this, 'lambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      roleName: roleName,
      managedPolicies: [
        iam.ManagedPolicy.fromManagedPolicyArn(this, 'CloudWatchFullAccess', 'arn:aws:iam::aws:policy/CloudWatchFullAccess'),
        iam.ManagedPolicy.fromManagedPolicyArn(this, 'AWSBatchServiceEventTargetRole', 'arn:aws:iam::aws:policy/service-role/AWSBatchServiceEventTargetRole'),
      ]
    });
    const policyParamStoreReadOnlyAccess = new iam.Policy(this, 'AWSParamStoreReadOnlyAccessJobTrigger', {
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'ssm:GetParameters',
            'ssm:GetParameter'
          ],
          resources: [`arn:aws:ssm:${region}:${account}:parameter/${appName}/${env}/*`]
        })
      ]
    })
    lambdaRole.attachInlinePolicy(policyParamStoreReadOnlyAccess)
    return lambdaRole
  }

  private createLambdaFunction(vpc: ec2.IVpc,  postfix: string)
  {    
    const account = cdk.Stack.of(this).account;
    const env = AppContext.getInstance().env;
    const appName = AppContext.getInstance().appName;
    const region = cdk.Stack.of(this).region

    // add lambda
    const Hanlder = new lambda.Function(this, `RestAPIHandler${postfix}`, {
      code: lambda.Code.fromAsset(`lambda/trigger_batch_restapi`),
      handler: 'handler.handler',
      runtime: lambda.Runtime.PYTHON_3_7,
      functionName: `${postfix}-${env}-api`,
      vpc: vpc,
      allowPublicSubnet: true,
      securityGroups: [this.createEc2Sg(vpc, env)],
      role: this.createLambdaRole(account, env, appName, region),
      environment: {
        ENV: env,
        APP_NAME: AppContext.getInstance().appName,
        PREFIX: env_const.batch_prefix,
        CMP: env_const.batch_computingEnv
      },
    });
    return Hanlder
  }
  
  private AddInboudRule(sg: ec2.SecurityGroup, ipv4: string, description: string) {
    sg.addIngressRule(ec2.Peer.ipv4(ipv4), ec2.Port.tcp(80), description);
    sg.addIngressRule(ec2.Peer.ipv4(ipv4), ec2.Port.tcp(443), description);
    sg.addIngressRule(ec2.Peer.ipv4(ipv4), ec2.Port.tcp(22), description);
  }

  private createEc2Sg(vpc: ec2.IVpc, env: string): ec2.SecurityGroup {
    const sg = new ec2.SecurityGroup(this, 'SecurityGroup', {
      vpc,
      description: `SG for rest-api-${env}`,
      securityGroupName: `rest-api-sg-${env}`,
    });

    // add IPs to inbond rule 
    this.AddInboudRule(sg, "xxxxxxxxxxxxxx/32", "from XXXX")
    
    return sg
  }
}  