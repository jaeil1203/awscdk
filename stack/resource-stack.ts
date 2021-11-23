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
import * as s3 from "@aws-cdk/aws-s3";
import * as iam from '@aws-cdk/aws-iam';
import * as env_const from './const'
import { BaseStack } from '../lib/base-stack';
import { AppContext } from '../lib/app-context';

interface ResourceStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
}

export class ResourceStack extends BaseStack {
  private mcBucket: s3.Bucket;

  constructor(scope: cdk.Construct, id: string, props: ResourceStackProps) {
    super(scope, id, props);

    const env = AppContext.getInstance().env;
    const vpc = props.vpc;

    // create a bastion host
    this.createEc2Instance(vpc, env)
  }

  private AddInboudRule(sg: ec2.SecurityGroup, ipv4: string, description: string) {
    sg.addIngressRule(ec2.Peer.ipv4(ipv4), ec2.Port.tcp(80), description);
    sg.addIngressRule(ec2.Peer.ipv4(ipv4), ec2.Port.tcp(443), description);
    sg.addIngressRule(ec2.Peer.ipv4(ipv4), ec2.Port.tcp(22), description);
  }

  private createEc2Sg(vpc: ec2.IVpc, env: string): ec2.SecurityGroup {
    const sg = new ec2.SecurityGroup(this, 'SecurityGroup', {
      vpc,
      description: `SG for cudo-agent-${env}`,
      securityGroupName: `cudo-agent-sg-${env}`,
    });

    // add IPs to inbond rule 
    this.AddInboudRule(sg, "xxxxxxxxxxxxxxx/32", "from SKT")
    
    return sg
  }

  private createInstanceRole(env: string, appName: string) {
    const roleName = `InstanceRole-${env}`
    const account = cdk.Stack.of(this).account
    const region = cdk.Stack.of(this).region
    const instanceRole = new iam.Role(this, 'InstanceRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      roleName: roleName,
      managedPolicies: [
        iam.ManagedPolicy.fromManagedPolicyArn(this, 'CloudWatchFullAccess', 'arn:aws:iam::aws:policy/CloudWatchFullAccess'),
        iam.ManagedPolicy.fromManagedPolicyArn(this, 'EC2InstanceProfileForImageBuilderECRContainerBuilds', 'arn:aws:iam::aws:policy/EC2InstanceProfileForImageBuilderECRContainerBuilds'),
        iam.ManagedPolicy.fromManagedPolicyArn(this, 'AmazonSSMManagedInstanceCore', 'arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore')
      ]
    });

    return instanceRole;
  }
  private createEc2Instance(vpc: ec2.IVpc, env: string) {
    const appName = AppContext.getInstance().appName;

    const ec_instance = new ec2.Instance(this, 'Ec2Instance', {
      vpc,
      vpcSubnets: vpc.selectSubnets({
        subnetType: ec2.SubnetType.PUBLIC
      }),
      keyName: env_const.keypair,
      instanceType: new ec2.InstanceType('t3.small'),
      machineImage: new ec2.AmazonLinuxImage,
      //machineImage: new ec2.WindowsImage(ec2.WindowsVersion.WINDOWS_SERVER_2019_KOREAN_FULL_BASE, {}), // set windows 2019 AMI with Korean
      securityGroup: this.createEc2Sg(vpc, env),
      role: this.createInstanceRole(env, appName),
      blockDevices: [
        {
          deviceName: '/dev/sda1',
          volume: ec2.BlockDeviceVolume.ebs(100),
        },/*
        {
          deviceName: '/dev/sdm',
          volume: ec2.BlockDeviceVolume.ebs(100),
        },*/
      ]
    });

    // auto-tagging for ec2 instance
    cdk.Tags.of(ec_instance).add('map-migrated', 'd-server-xxxxxxxxxx'); // add a MAP tag
    cdk.Tags.of(ec_instance).add('Project', AppContext.getInstance().appName);
    cdk.Tags.of(ec_instance).add('DeployEnvironment', AppContext.getInstance().env);
  }
}
