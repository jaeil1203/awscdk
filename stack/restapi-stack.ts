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

    new apigw.LambdaRestApi(this, 'Endpoint', { 
        handler: test,        
        
    });
  }
  	
  private createLambdaFunction(vpc: ec2.IVpc,  postfix: string)
  {
    const env = AppContext.getInstance().env;
    // add lambda
    const Hanlder = new lambda.Function(this, `RestAPIHandler${postfix}`, {
      code: lambda.Code.fromAsset(`lambda/test_restapi`),
      handler: 'test.handler',
      runtime: lambda.Runtime.PYTHON_3_7,
      functionName: `${postfix}-${env}-api`,
      vpc: vpc,
      allowPublicSubnet: true,
      securityGroups: [this.createEc2Sg(vpc, env)]
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
    this.AddInboudRule(sg, "xxxxxxxxxxxxxxxxx/32", "from SKT")
    
    return sg
  }
}  