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
import * as ec2 from "@aws-cdk/aws-ec2";
import { BaseStack } from '../lib/base-stack';
import { AppContext } from '../lib/app-context';
import * as env_const from './const'

export class VpcStack extends BaseStack {
  public readonly vpc: ec2.Vpc;
    
  // overriding get availablityzones() 
  // to restrict target azs to ap-northeast-2a and ap-northeast-2c 
  get availabilityZones(): string[] {
    return ['ap-northeast-2a', 'ap-northeast-2c'];
  }

  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // vpc creation
    this.vpc = new ec2.Vpc(this, 'Vpc' ,{
      cidr: env_const.devvpc.CIRD,
      subnetConfiguration: [
        {   // for public subnet with NAT gateway
            cidrMask: env_const.devvpc.cidrMask_public,
            name: 'public',
            subnetType: ec2.SubnetType.PUBLIC,
        },
        {   // for private subnet
            cidrMask: env_const.devvpc.cidrMask_private,
            name: 'private',
            subnetType: ec2.SubnetType.PRIVATE,
        },
      ],
      gatewayEndpoints: { 
        S3: {
          service: ec2.GatewayVpcEndpointAwsService.S3,
        },
      },
    });

    /*
    // VPC Endpoint Creation for InterfaceEndpoints
    // (RDS, SecretsManager, ECR, Cloudwatch logs, KMS, SSM)
    let interfaceVpceServices = [
      ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
      ec2.InterfaceVpcEndpointAwsService.ECR,
      ec2.InterfaceVpcEndpointAwsService.ECR_DOCKER,
      ec2.InterfaceVpcEndpointAwsService.KMS, // Key Management Service
      ec2.InterfaceVpcEndpointAwsService.RDS,
      ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
      ec2.InterfaceVpcEndpointAwsService.STS, // Security Token Store
      ec2.InterfaceVpcEndpointAwsService.SSM, // System Manager including parameter store
    ];

    for (var i in interfaceVpceServices){
      this.createInterfaceEndpoint(interfaceVpceServices[i]);
    }
    */

    // auto-tagging in vpc    
    cdk.Tags.of(this.vpc).add('map-migrated', 'd-server-xxxxxxxxxxx');  // for MAP
    cdk.Tags.of(this.vpc).add('Project', AppContext.getInstance().appName);
    cdk.Tags.of(this.vpc).add('DeployEnvironment', AppContext.getInstance().env);
    cdk.Tags.of(this.vpc).add('Name', `vpc-${AppContext.getInstance().appName}-${AppContext.getInstance().env}`);

  }
  
  private createInterfaceEndpoint(service: ec2.InterfaceVpcEndpointAwsService) {
    const serviceName = service.name.split('.').pop();
    this.vpc.addInterfaceEndpoint(`VPCE-${serviceName}`, { // connect to interface endpoint for the vpc
      service: service,
    });
  }

}
