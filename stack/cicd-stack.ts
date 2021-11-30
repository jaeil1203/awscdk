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
import * as ecr from '@aws-cdk/aws-ecr';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as codebuild from '@aws-cdk/aws-codebuild';
import * as codecommit from '@aws-cdk/aws-codecommit';
import * as codepipeline from '@aws-cdk/aws-codepipeline';
import * as codepipeline_actions from '@aws-cdk/aws-codepipeline-actions';
import * as kms from '@aws-cdk/aws-kms';
import * as s3 from '@aws-cdk/aws-s3';
import * as env_const from './const'
import { BaseStack } from '../lib/base-stack';
import { AppContext } from '../lib/app-context';


interface CicdStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
}

export class CicdStack extends BaseStack {

  public readonly Repository: ecr.IRepository;
  private vpc: ec2.Vpc;
  private env: string;
  private appName: string;
  private buildBucket: s3.Bucket;
  private srcRepo: codecommit.IRepository;

  constructor(scope: cdk.Construct, id: string, props: CicdStackProps) {
    super(scope, id, props);

    this.appName = AppContext.getInstance().appName;
    this.vpc = props.vpc;
    this.env = AppContext.getInstance().env;

    // create a bucket for build artifiacts
    this.buildBucket = new s3.Bucket(this, env_const.appName+"CICDBucket", {
      bucketName: `${env_const.appName}-cicd`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: kms.Alias.fromAliasName(
        this, 'BuildBucketEncryptionKey', 'alias/aws/s3'
      ),
      versioned: false,
    });
    
    cdk.Tags.of(this.buildBucket).add('map-migrated', 'd-server-xxxxxxxxx');
    cdk.Tags.of(this.buildBucket).add('Project', AppContext.getInstance().appName);
    cdk.Tags.of(this.buildBucket).add('DeployEnvironment', this.env);
    cdk.Tags.of(this.buildBucket).add('Name', `encsys-buildBucket`);

    // get codecommit repository from RepositoryName
    this.srcRepo = codecommit.Repository.fromRepositoryName(this, 'codecommitRepo', env_const.repository);
    
    cdk.Tags.of(this.srcRepo).add('map-migrated', 'd-server-xxxxxxxxxx');
    cdk.Tags.of(this.srcRepo).add('Project', this.appName);
    cdk.Tags.of(this.srcRepo).add('DeployEnvironment', this.env);
    cdk.Tags.of(this.srcRepo).add('Name', `encsys-srcRepo`);

    // get ecr repository from RepositoryName
    this.Repository = ecr.Repository.fromRepositoryName(this, 'ecrRepo', env_const.repository);

    // create main pipeline
    this.createPipeline();
  }

  private createBuildProject(resourceName: string, projectName: string, target: string, name: string, buildSpec: codebuild.BuildSpec): codebuild.Project {
    
    const prj = new codebuild.Project(this, resourceName, {
      allowAllOutbound: true,
      buildSpec: buildSpec,
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_2_0,
        computeType: codebuild.ComputeType.MEDIUM,
        privileged: true,
      },
      environmentVariables: {
        'ECR': {
          value: this.Repository.repositoryUri,
          type: codebuild.BuildEnvironmentVariableType.PLAINTEXT
        },
        'TARGET': {
          value: target,
          type: codebuild.BuildEnvironmentVariableType.PLAINTEXT
        },
        'APP': {
          value: name,
          type: codebuild.BuildEnvironmentVariableType.PLAINTEXT
        },
      },
      source: codebuild.Source.codeCommit({
        repository: this.srcRepo
      }),
      grantReportGroupPermissions: false,
      projectName: projectName,
      subnetSelection: this.vpc.selectSubnets({
        subnetType: ec2.SubnetType.PRIVATE,
      }),
      timeout: cdk.Duration.minutes(30),
      vpc: this.vpc,
    });

    // grant build project's role to access ecr
    this.Repository.grantPullPush(prj.role!);

    // add tags
    cdk.Tags.of(prj).add('map-migrated', 'd-server-xxxxxxxxx');
    cdk.Tags.of(prj).add('Project', env_const.appName);
    cdk.Tags.of(prj).add('DeployEnvironment', AppContext.getInstance().env);
    cdk.Tags.of(prj).add('Name', `encsys-${resourceName}Build`);

    return prj
  }

  private createPipeline() {
    const imageBuild = this.createBuildProject(
      'PipelineImageBuild', 
      `${this.appName}-pipeline-image-build`, 
      'latest', env_const.repository,
      codebuild.BuildSpec.fromSourceFilename('codebuild/buildspec.yaml'),
    ); 
    
    const sourceOutput = new codepipeline.Artifact('SourceOutput');
    const sourceAction = new codepipeline_actions.CodeCommitSourceAction({
      actionName: 'CommitOnMain',
      repository: this.srcRepo,
      branch: env_const.codecommit_branch,
      codeBuildCloneOutput: true,
      output: sourceOutput,
    });
    
    /*    
    const sourceAction_ecr = new codepipeline_actions.EcrSourceAction({
      actionName: 'ECROnMain',
      repository: this.ffmpegRepository,
      imageTag: 'main',
      output: sourceOutput_ecr
    })
    */
    const buildImageAction = new codepipeline_actions.CodeBuildAction({
      actionName: 'BuildImage',
      input: sourceOutput,
      project: imageBuild,
      /*
      extraInputs: [
        sourceOutput_ecr,
      ]      
      */
    });

    /*

    const approvalAction = new codepipeline_actions.ManualApprovalAction({
      actionName: 'ManualApproval',
      additionalInformation: 'This deploy is scary, will you approve it?!',
      externalEntityLink: 'https://ap-northeast-2.console.aws.amazon.com/codesuite/codepipeline/pipelines',
    });

    */

    // create codepipeline
    const pipeline = new codepipeline.Pipeline(this, 'MainPipeline', {
      pipelineName: `${this.appName}-MainPipeline`,
      artifactBucket: this.buildBucket,
      stages: [
        {
          stageName: 'Source',
          actions: [sourceAction],
        },
        {
          stageName: 'BuildImage',
          actions: [buildImageAction]
        },
        /*
        {
          stageName: 'ManualApproval',
          actions: [approvalAction]
        },
        */
      ]
    });
    
    cdk.Tags.of(pipeline).add('map-migrated', 'd-server-zzzzzzzzzzz');
    cdk.Tags.of(pipeline).add('Project', AppContext.getInstance().appName);
    cdk.Tags.of(pipeline).add('DeployEnvironment', AppContext.getInstance().env);
    cdk.Tags.of(pipeline).add('Name', `CICDPipeline`);

  }
}
