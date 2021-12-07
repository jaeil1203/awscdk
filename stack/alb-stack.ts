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
import * as ec2 from '@aws-cdk/aws-ec2';
import * as iam from '@aws-cdk/aws-iam';
import * as ecs from '@aws-cdk/aws-ecs';
import * as ecr from '@aws-cdk/aws-ecr';
import * as ecs_patterns from '@aws-cdk/aws-ecs-patterns';
import * as codebuild from '@aws-cdk/aws-codebuild';
import * as codecommit from '@aws-cdk/aws-codecommit';
import * as codepipeline from '@aws-cdk/aws-codepipeline';
import * as codepipeline_actions from '@aws-cdk/aws-codepipeline-actions';
import { BaseStack } from '../lib/base-stack';
import { AppContext } from '../lib/app-context';
import * as s3 from '@aws-cdk/aws-s3';
import * as kms from '@aws-cdk/aws-kms';
import * as logs from '@aws-cdk/aws-logs';
import * as elbv2 from '@aws-cdk/aws-elasticloadbalancingv2'
import * as notifications from '@aws-cdk/aws-codestarnotifications';
import * as env_const from './const'

interface StackProps extends cdk.StackProps {
  vpc: ec2.IVpc
}

export class ALBStack extends BaseStack {
  constructor(scope: cdk.Construct, id: string, props: StackProps) {
    super(scope, id, props);

    const env = AppContext.getInstance().env;
    const app = AppContext.getInstance().appName;

    // Create an ECS cluster
    const cluster = new ecs.Cluster(this, 'ClusterALB', {vpc: props.vpc});

    // ecr repo from name
    const ecrRepo = ecr.Repository.fromRepositoryName(this, 'ecrRepo', `${app}-test`);

    // create task def.
    const taskDefinition = this.createTaskDefinition(ecrRepo, env, app);
    
    // Instantiate an Amazon ECS Service
    const fargateService = this.createALB(props.vpc, cluster, taskDefinition, false)
    this.createCICD(props.vpc, cluster, fargateService, ecrRepo)
    this.putParameter('ELBDNSName', JSON.stringify({
      LoadBalancerDNS: fargateService.loadBalancer.loadBalancerDnsName,
    }));
      
    cdk.Tags.of(fargateService.service).add('map-migrated', 'd-server-00wkp68bblxi7u');
    cdk.Tags.of(fargateService.service).add('Project', app);
    cdk.Tags.of(fargateService.service).add('DeployEnvironment', env);
    cdk.Tags.of(fargateService.service).add('Name', `encsys-service`);

    cdk.Tags.of(fargateService.loadBalancer).add('map-migrated', 'd-server-00wkp68bblxi7u');
    cdk.Tags.of(fargateService.loadBalancer).add('Project', app);
    cdk.Tags.of(fargateService.loadBalancer).add('DeployEnvironment', env);
    cdk.Tags.of(fargateService.loadBalancer).add('Name', `encsys-ELB`);
  }  

  private createALB(vpc: ec2.IVpc, cluster: ecs.Cluster, taskDefinition: ecs.TaskDefinition, pLB: boolean) {
    const env = AppContext.getInstance().env;
    const loadbalancer = new elbv2.ApplicationLoadBalancer(this, 'LB', {
      vpc: vpc,
      internetFacing: pLB,
      securityGroup: this.createSg(vpc, env),
    })
    let fargateService = new ecs_patterns.ApplicationLoadBalancedFargateService(this, 'FargateServiceDev', {
      cluster: cluster,
      taskDefinition: taskDefinition,
      loadBalancer: loadbalancer,
      desiredCount: 2,
      listenerPort: 80,
      openListener: false
    });

    fargateService.targetGroup.enableCookieStickiness(cdk.Duration.days(1))
    fargateService.targetGroup.configureHealthCheck({
      interval: cdk.Duration.seconds(120),
      timeout: cdk.Duration.seconds(60),
    })
    
    fargateService.service.autoScaleTaskCount({
      maxCapacity: 3
    }).scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 70
    });

    new cdk.CfnOutput(this, 'LoadBalancerDNS', { value: fargateService.loadBalancer.loadBalancerDnsName });
    return fargateService
  }
  private createCICD(vpc: ec2.IVpc, cluster: ecs.Cluster, fargateService: ecs_patterns.ApplicationLoadBalancedFargateService, ecrRepo: ecr.IRepository) {
    
    const env = AppContext.getInstance().env;
    const app = AppContext.getInstance().appName;

    // derive the repository of codecommit
    const codecommitRepo = codecommit.Repository.fromRepositoryName(this, 'codecommitRepo', `${app}-test`);
    const codecommitSource = codebuild.Source.codeCommit({
      repository: codecommitRepo
    });    

    // set the variable to triggering branch (dev or main)
    var trigger_branch = `${env}`
    if ('dev' != env){
      trigger_branch = 'main'
    }
    
    // print out trigger_branch
    new cdk.CfnOutput(this, 'trigger_branch', { value: trigger_branch });

    // CODEBUILD - project
    const project = new codebuild.Project(this, 'WebBuild', {
      allowAllOutbound: true,
      projectName: `${this.stackName}`,
      source: codecommitSource,
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_2_0,
        computeType: codebuild.ComputeType.MEDIUM,
        privileged: true,
      },
      environmentVariables: {
        'ECR_REPO_URI': {
          value: `${ecrRepo.repositoryUri}`,
          type: codebuild.BuildEnvironmentVariableType.PLAINTEXT
        },
        'TARGET': {
          value: trigger_branch,
          type: codebuild.BuildEnvironmentVariableType.PLAINTEXT
        },
        'CONTAINER_NAME':{
          value: `${app}-${env}`,
          type: codebuild.BuildEnvironmentVariableType.PLAINTEXT
        }
      },
      buildSpec: codebuild.BuildSpec.fromSourceFilename('codebuild/buildspec.yaml'),
      grantReportGroupPermissions: false,
      vpc: vpc,
    });    
    
    cdk.Tags.of(project).add('map-migrated', 'd-server-xxxxxxxxx');
    cdk.Tags.of(project).add('Project', app);
    cdk.Tags.of(project).add('DeployEnvironment', env);
    cdk.Tags.of(project).add('Name', `encsys-build-project`);

    // ***PIPELINE ACTIONS***
    const sourceOutput = new codepipeline.Artifact();
    const buildOutput = new codepipeline.Artifact();

    // define the action for code commit
    const sourceAction = new codepipeline_actions.CodeCommitSourceAction({
      actionName: 'Codecommit_Source',
      repository: codecommitRepo,
      output: sourceOutput,
      branch: trigger_branch,
    });

    // define the action for code build
    const buildAction = new codepipeline_actions.CodeBuildAction({
      actionName: 'CodeBuild',
      project: project,
      input: sourceOutput,
      outputs: [buildOutput], // optional
    });

    // define the action for deployment
    const deployAction = new codepipeline_actions.EcsDeployAction({
      actionName: 'DeployAction',
      service: fargateService.service,
      imageFile: new codepipeline.ArtifactPath(buildOutput, `imagedefinitions.json`)
    });

    
    // PIPELINE STAGES
    // create a bucket for build artifiacts
    const buildBucket = new s3.Bucket(this, "CICDBucket", {
      bucketName: `cicd-${AppContext.getInstance().appName}-${env}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: kms.Alias.fromAliasName(
        this, 'BuildBucketEncryptionKey', 'alias/aws/s3'
      ),
      versioned: false,
    });

    // add tags    
    cdk.Tags.of(buildBucket).add('map-migrated', 'd-server-xxxxxxxxx');
    cdk.Tags.of(buildBucket).add('Project', app);
    cdk.Tags.of(buildBucket).add('DeployEnvironment', env);
    cdk.Tags.of(buildBucket).add('Name', `encsys-build-bucket`);
    
    const pipeline = new codepipeline.Pipeline(this, `WebECSPipeline-${env}`, {
      pipelineName: `${app}-WebECSPipeline-${env}`,
      artifactBucket: buildBucket,
      stages: [
        {
          stageName: 'Source',
          actions: [sourceAction],
        },
        {
          stageName: 'Build',
          actions: [buildAction],
        },
        {
          stageName: 'Deploy-to-ECS',
          actions: [deployAction],
        },
      ]
    });
    
    cdk.Tags.of(pipeline).add('map-migrated', 'd-server-xxxxxxxxxxx');
    cdk.Tags.of(pipeline).add('Project', app);
    cdk.Tags.of(pipeline).add('DeployEnvironment', env);
    cdk.Tags.of(pipeline).add('Name', `encsys-build-pipeline`);
    
    new notifications.CfnNotificationRule(this, 'CICDNotificationRule', {
      name: pipeline.pipelineName,
      detailType: 'FULL',
      resource: pipeline.pipelineArn,
      eventTypeIds: [
        'codepipeline-pipeline-pipeline-execution-started',
        'codepipeline-pipeline-pipeline-execution-succeeded',
        'codepipeline-pipeline-pipeline-execution-failed',
        'codepipeline-pipeline-manual-approval-needed',
      ],
      targets: [{
        "targetAddress": `arn:aws:chatbot::${this.account}:chat-configuration/slack-channel/${env_const.slack_channel}`,
        "targetType": 'AWSChatbotSlack'
      }],
    });

    ecrRepo.grantPullPush(project.role!)
    project.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        "ecs:DescribeCluster",
        "ecr:GetAuthorizationToken",
        "ecr:BatchCheckLayerAvailability",
        "ecr:BatchGetImage",
        "ecr:GetDownloadUrlForLayer"
        ],
      resources: [`${cluster.clusterArn}`],
    }));
  }
  protected createLambdaRole(roleName: string) {
    const lambdaRole = new iam.Role(this, 'lambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      roleName: roleName,
      managedPolicies: [
        iam.ManagedPolicy.fromManagedPolicyArn(this, 'AWSLambdaBasicExecutionRole', 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'),
        iam.ManagedPolicy.fromManagedPolicyArn(this, 'CloudWatchFullAccess', 'arn:aws:iam::aws:policy/CloudWatchFullAccess'),
        iam.ManagedPolicy.fromManagedPolicyArn(this, 'AWSLambdaVPCAccessExecutionRole', 'arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole'),
      ]
    });
    return lambdaRole
  }

  private AddInboudRule(sg: ec2.SecurityGroup, ipv4: string, description: string) {
    sg.addIngressRule(ec2.Peer.ipv4(ipv4), ec2.Port.tcp(80), description);
  }

  private createSg(vpc: ec2.IVpc, env: string) {
    const sg = new ec2.SecurityGroup(this, 'WebSecurityGroup', {
      vpc,
      description: `SG for web`,
      allowAllOutbound: true,
      securityGroupName: `web-sg-${env}`,
    });

    // add IPs to inbond rule 
    this.AddInboudRule(sg, "xxxxxxxxxxxx/24", "from EMS");
    return sg
  }

  private createTaskDefinition(repository: ecr.IRepository, env: string, app: string) {
    const taskDefinition = new ecs.FargateTaskDefinition (this, 'TaskDef', {
      taskRole: new iam.Role(this, 'ECSTaskRole', {
        assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
        managedPolicies: [
        iam.ManagedPolicy.fromManagedPolicyArn(this, 'AmazonS3FullAccess', 'arn:aws:iam::aws:policy/AmazonS3FullAccess'),
        iam.ManagedPolicy.fromManagedPolicyArn(this, 'AmazonECSTaskExecutionRolePolicy', 'arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy'),
        iam.ManagedPolicy.fromManagedPolicyArn(this, 'AmazonSSMManagedInstanceCore', 'arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore'),
        iam.ManagedPolicy.fromManagedPolicyArn(this, 'SecretsManagerReadWrite', 'arn:aws:iam::aws:policy/SecretsManagerReadWrite'),
        iam.ManagedPolicy.fromManagedPolicyArn(this, 'AWSBatchServiceEventTargetRole', 'arn:aws:iam::aws:policy/service-role/AWSBatchServiceEventTargetRole'),
      ]}),      
      cpu: cdk.Lazy.number({ produce: () => 512 }),
      memoryLimitMiB: cdk.Lazy.number({ produce: () => 4096 }),
    });
    
    // create log group for web
    const loggroup = new logs.LogGroup(this, `LogGrop${env}`,{
      logGroupName: `/aws/ecs/${app}web/${env}`,
      retention: logs.RetentionDays.SIX_MONTHS,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    })

    // add container from ECR
    taskDefinition.addContainer('Container', {
      image: ecs.ContainerImage.fromEcrRepository(repository, 'dev'),
      portMappings: [{ containerPort: 80 }],
      memoryLimitMiB: 4096, // 4GiB
      cpu: 512, // 0.5 vCPU
      logging: new ecs.AwsLogDriver({
        streamPrefix: `logs`,
        logGroup: loggroup,
      }),
      containerName: `${app}-${env}`,
    });
    
    cdk.Tags.of(taskDefinition).add('map-migrated', 'd-server-xxxxxxxx');
    cdk.Tags.of(taskDefinition).add('Project', app);
    cdk.Tags.of(taskDefinition).add('DeployEnvironment', env);
    cdk.Tags.of(taskDefinition).add('Name', `FargateTaskDefinition`);
        
    return taskDefinition;
  }
}
