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
import * as rds from '@aws-cdk/aws-rds';
import * as iam from '@aws-cdk/aws-iam';
import * as env_const from './const'
import { BaseStack } from '../lib/base-stack';
import { AppContext } from '../lib/app-context';
import { BlockDeviceVolume } from '@aws-cdk/aws-ec2';
import { Aws } from '@aws-cdk/core';

interface ResourceStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
}

export class ResourceStack extends BaseStack {
  private mcBucket: s3.Bucket;

  constructor(scope: cdk.Construct, id: string, props: ResourceStackProps) {
    super(scope, id, props);

    const env = AppContext.getInstance().env;
    const vpc = props.vpc;

    // create S3 buckets such as input
    this.createMediaBucket(`EncodingSystem`, `input`, false, false)

    // rds serverless cluster creation
    this.createRDSAuroraServerless(vpc, env);

    // create a bastion host
    this.createEc2Instance(vpc, env)

  }

  private createMediaBucket(stackName: string, buckename: string, ver: boolean, keyEnabled: boolean)
  {    
    const env = AppContext.getInstance().env;    
    const account = cdk.Stack.of(this).account;
    const region = cdk.Stack.of(this).region;
    const appName = AppContext.getInstance().appName;

    // s3 bucket creation
    this.mcBucket = new s3.Bucket(this, `${stackName}${env}`, {
      bucketName: `${AppContext.getInstance().appName}-${env}-${buckename}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY, 
      versioned: ver, // manage to version s3 data
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,  
      bucketKeyEnabled: keyEnabled,
      lifecycleRules: [
        {
          //https://docs.aws.amazon.com/cdk/api/latest/docs/@aws-cdk_aws-s3.LifecycleRule.html
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(1),
          enabled: true,
          //expiration: cdk.Duration.days(30),
          //expirationDate: new Date('2021-12-01'),
          //expiredObjectDeleteMarker: false,
          id: 's3-LifecycleRule',
          //noncurrentVersionExpiration: cdk.Duration.days(7),
          /*
          noncurrentVersionTransitions: [{
            storageClass: s3.StorageClass.GLACIER,
            transitionAfter: cdk.Duration.minutes(30),
          }],
          prefix: 'prefix',
          tagFilters: {
            tagFiltersKey: tagFilters,
          },*/
          
          transitions: [{
            //storageClass: s3.StorageClass.INTELLIGENT_TIERING,
            storageClass: s3.StorageClass.GLACIER,
        
            // the properties below are optional
            transitionAfter: cdk.Duration.days(1),
            //transitionDate: new Date(),
          }],
        }
      ],
    });

    const s3policy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      principals: [
        new iam.ArnPrincipal(`arn:aws:iam::${account}:user/xxxxxxx`),
        new iam.ArnPrincipal(`arn:aws:iam::${account}:user/xxxxxxx`),     
      ],
      actions: [            
        "s3:ListBucket",
        "s3:GetObject",
        "s3:GetObjectTagging"       
      ],
      resources: [
        `arn:aws:s3:::${AppContext.getInstance().appName}-${env}-${buckename}/*`,
        `arn:aws:s3:::${AppContext.getInstance().appName}-${env}-${buckename}`
      ]
    })

    this.mcBucket.addToResourcePolicy(s3policy)

    // auto-tagging for s3
    cdk.Tags.of(this.mcBucket).add('map-migrated', 'd-server-xxxxxxxxxxx');
    cdk.Tags.of(this.mcBucket).add('Project', AppContext.getInstance().appName);
    cdk.Tags.of(this.mcBucket).add('DeployEnvironment', AppContext.getInstance().env);
    cdk.Tags.of(this.mcBucket).add('Name', `encsys-bucket-${buckename}`);
  }

  private createRDSAuroraServerless(vpc: ec2.Vpc, env: string)
  : rds.ServerlessCluster 
  {
    // ParameterGroup creation
    const pg = new rds.ParameterGroup(
      this, 'RdsParamGroup', {
        description: `Custom Parameter Group for media-db-${env}`,
        engine: rds.DatabaseClusterEngine.auroraMysql({ 
          version: rds.AuroraMysqlEngineVersion.VER_5_7_12 
        }),
        parameters: {
          lc_time_names: "ko_KR",
          time_zone: "Asia/Seoul",
          lower_case_table_names: "1",
          innodb_file_per_table: "1",
          character_set_server: "utf8mb4",
          collation_server: "utf8mb4_unicode_ci",
        }
      }
    );

    // SecurityGroup creation
    const sg = this.createRdsSg(vpc, env);

    const cluster = new rds.ServerlessCluster(this, 'RdsServerlessCluster', {
      engine: rds.DatabaseClusterEngine.auroraMysql({ 
        version: rds.AuroraMysqlEngineVersion.VER_5_7_12 
      }),
      vpc,
      credentials: rds.Credentials.fromGeneratedSecret('mysqladmin', { // use secret manager for RDS credentials
        secretName: `/${AppContext.getInstance().appName}/${AppContext.getInstance().env}/media-db-info`
      }),
      scaling: {
        autoPause: cdk.Duration.minutes(0),
        minCapacity: rds.AuroraCapacityUnit.ACU_1,
        maxCapacity: rds.AuroraCapacityUnit.ACU_8,
      },
      clusterIdentifier: `media-db-${env}`,
      parameterGroup: pg,
      securityGroups: [sg],
      vpcSubnets: vpc.selectSubnets({
        subnetType: ec2.SubnetType.PRIVATE
      }),
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });
    
    // auto-tagging for cluster
    cdk.Tags.of(cluster).add('map-migrated', 'd-server-xxxxxxxxxxxx');
    cdk.Tags.of(cluster).add('Project', AppContext.getInstance().appName);
    cdk.Tags.of(cluster).add('DeployEnvironment', AppContext.getInstance().env);
    cdk.Tags.of(cluster).add('Name', `encsys-${env}`);

    return cluster;
  }

  private createRdsSg(vpc: ec2.Vpc, env: string): ec2.SecurityGroup {
    const sg = new ec2.SecurityGroup(this, 'RdsSecurityGroup', {
      vpc,
      description: `SG for media-db-${env}`,
      allowAllOutbound: true,
      securityGroupName: `media-db-${env}`,
    });

    // inbound rule to connect RDS with 3306 port for same vpc
    sg.addIngressRule(
      ec2.Peer.ipv4(vpc.vpcCidrBlock), 
      ec2.Port.tcp(3306), 
    );
    return sg
  }

  private AddInboudRule(sg: ec2.SecurityGroup, ipv4: string, description: string) {
    sg.addIngressRule(ec2.Peer.ipv4(ipv4), ec2.Port.tcp(80), description);
    sg.addIngressRule(ec2.Peer.ipv4(ipv4), ec2.Port.tcp(443), description);
    sg.addIngressRule(ec2.Peer.ipv4(ipv4), ec2.Port.tcp(22), description);
  }

  private createEc2Sg(vpc: ec2.IVpc, env: string): ec2.SecurityGroup {
    const sg = new ec2.SecurityGroup(this, 'SecurityGroup', {
      vpc,
      description: `SG for ${env}`,
      securityGroupName: `sg-${env}`,
    });

    // add IPs to inbond rule 
    this.AddInboudRule(sg, "xxxxxxxxxxxxxxxxxxx/32", "from XXXX")
    
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

    const policyParamStoreReadOnlyAccess = new iam.Policy(this, 'AWSParamStoreReadOnlyAccess', {
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

    const policySecretsManagerReadOnlyAccess = new iam.Policy(this, 'AWSSecretsManagerReadOnlyAccess', {
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [            
            "secretsmanager:GetSecretValue"            
          ],
          resources: [`arn:aws:secretsmanager:${region}:${account}:secret:/${appName}/${env}/*`]
        })
      ]
    })

    instanceRole.attachInlinePolicy(policyParamStoreReadOnlyAccess)
    instanceRole.attachInlinePolicy(policySecretsManagerReadOnlyAccess)

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
      instanceType: new ec2.InstanceType('c5.xlarge'),
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
