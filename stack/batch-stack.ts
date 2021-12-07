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
import * as iam from '@aws-cdk/aws-iam';
import * as batch from '@aws-cdk/aws-batch';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as ecs from '@aws-cdk/aws-ecs';
import * as ecr from '@aws-cdk/aws-ecr';
import { BaseStack } from '../lib/base-stack';
import { AppContext } from '../lib/app-context';
import * as env_const from './const'

interface StackProps extends cdk.StackProps {
  vpc: ec2.IVpc,
}

export class BatchStack extends BaseStack{
  constructor(scope: cdk.Construct, id: string, props: StackProps) {
    super(scope, id, props);

    // generate roles and instanceprofile
    const [instanceRole, batchServiceRole] = this.createComputeEnvironmentRole(props.vpc);
    const instanceProfile = this.createComputeEnvironmentProfile(instanceRole);

    // create EC2-based compute environment, job definition and job que for batch process
    //this.createbatches(props, batchServiceRole, instanceProfile);
    this.createbatch(props, batchServiceRole, instanceProfile, 
      env_const.batch_repository,  // ECR repository
      env_const.batch_prefix,  // prefix
      "",           // post fix
      env_const.batch_ec2.minCPUs, 
      env_const.batch_ec2.maxCPUs, 
      env_const.batch_ec2.desiredCPUs, 
      env_const.batch_ec2.volumeSize, 
      env_const.batch_ec2.InstanceSize, 
      env_const.batch_ec2.container_vCPUs, 
      env_const.batch_ec2.container_memory, 
      env_const.batch_ec2.comput_order, 
      env_const.batch_ec2.batch_order,
      )
      
    const FargateinstanceRole = this.createJobDefinitionFargateRole()
    
    // create fargate-based batch  compute environment, job definition and job que for batch process(encoder)
     this.createbatchFargate(props, batchServiceRole, FargateinstanceRole, 
      env_const.batch_repository, // ECR repository
      env_const.batch_prefix, // prefix
      env_const.batch_fargate_spot.maxCPUs, 
      env_const.batch_fargate_spot.container_vCPUs, 
      env_const.batch_fargate_spot.container_memory,
      env_const.batch_fargate_spot.comput_order, 
      env_const.batch_fargate_spot.batch_order);
  }  
  
  protected createbatch(props: StackProps, batchServiceRole: iam.Role, instanceProfile: iam.CfnInstanceProfile, 
                                ECRrepos: string, prefix: string, postfix: string, minCPUs: number, maxCPUs: number, 
                                desiredCPUs:number, volumeSize:number, InstanceSize: ec2.InstanceSize, Container_vcpu: number, 
                                Container_memory: number, comput_order:number, batch_order:number) {
    const app = AppContext.getInstance().appName;
    const env = AppContext.getInstance().env;

    // get ECR repository from the name of repository in ECR as hevc_encoder-inspector/encoder/merger
    const EcrRepository = ecr.Repository.fromRepositoryName(this, `ecrRepo${prefix}${postfix}`, `${ECRrepos}`);
    
    // generate computer environment (inspector/encoder/merger)
    const computeEnvironment = this.createComputeEnvironment(props.vpc, batchServiceRole, instanceProfile, 
      `${env}-${prefix}`, minCPUs, maxCPUs, desiredCPUs, volumeSize, InstanceSize); 

    // pass computer environment name to parameter store unnecessary. only job def and queue def is necessary
    const JobQueue = this.createJobQueue(computeEnvironment, prefix, comput_order, batch_order);
    const JobDef = this.createJobDefinition(EcrRepository, prefix, Container_vcpu, Container_memory);

    this.putParameter(`Batch${prefix}-EC2`, JSON.stringify({
      jobQueueName: JobQueue.jobQueueName,
      jobDefinitionName: JobDef.jobDefinitionName
    }), env);

    // print JobQueue and JebDefinition in output of cloudformation and command window
    new cdk.CfnOutput(this, `JobQueue-${prefix}`, { value: JobQueue.jobQueueArn });
    new cdk.CfnOutput(this, `JobDefinition-${prefix}`, { value: JobDef.jobDefinitionArn });
  }

  protected createComputeEnvironmentRole(vpc: ec2.IVpc) {
    const env = AppContext.getInstance().env;    
    const s3FullAccessPolicy = iam.ManagedPolicy.fromManagedPolicyArn(this, 'AmazonS3FullAccess', 'arn:aws:iam::aws:policy/AmazonS3FullAccess');

    // for batch (separate stack?)
    // generate iam instance role for ec2
    const instanceRole = new iam.Role(this, 'InstanceRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      roleName: `H265EncodingInstanceRole-${AppContext.getInstance().env}`,
      managedPolicies: [
        s3FullAccessPolicy,
        iam.ManagedPolicy.fromManagedPolicyArn(this, 'CloudWatchFullAccess', 'arn:aws:iam::aws:policy/CloudWatchFullAccess'),
        iam.ManagedPolicy.fromManagedPolicyArn(this, 'AmazonECS_FullAccess', 'arn:aws:iam::aws:policy/AmazonECS_FullAccess'),
        iam.ManagedPolicy.fromManagedPolicyArn(this, 'EC2InstanceProfileForImageBuilderECRContainerBuilds', 'arn:aws:iam::aws:policy/EC2InstanceProfileForImageBuilderECRContainerBuilds'),
        iam.ManagedPolicy.fromManagedPolicyArn(this, 'AWSElementalMediaConvertFullAccess', 'arn:aws:iam::aws:policy/AWSElementalMediaConvertFullAccess'),
        iam.ManagedPolicy.fromManagedPolicyArn(this, 'AWSBatchServiceEventTargetRole', 'arn:aws:iam::aws:policy/service-role/AWSBatchServiceEventTargetRole')
      ]
    })

    // generate iam role for batch
    // s3는 storage-stack에서 만든 s3에만 full access 가능한 inline policy를 생성해서 attach 필요 (미구현)
    const batchServiceRole = new iam.Role(this, 'BatchServiceRole', {
      assumedBy: new iam.ServicePrincipal('batch.amazonaws.com'),
      roleName: `H265BatchRole-${AppContext.getInstance().env}`,
      managedPolicies: [
        s3FullAccessPolicy,
        // Policy for AWS Batch service role which allows access to related services including EC2, Autoscaling, EC2 Container service and Cloudwatch Logs.
        iam.ManagedPolicy.fromManagedPolicyArn(this, 'AWSBatchServiceRole', 'arn:aws:iam::aws:policy/service-role/AWSBatchServiceRole')
      ]
    })
    
    // generate role for mediaconvert to access s3 bucket
    const mediaConvertRole = new iam.Role(this, 'MediaConvertRole', {
      assumedBy: new iam.ServicePrincipal('mediaconvert.amazonaws.com'),
      roleName: `H265MediaConvertRole-${AppContext.getInstance().env}`,
      managedPolicies: [
        s3FullAccessPolicy,
      ]
    })

    // store parameter for mediaConvertRole
    this.putParameter('mediaConvertRole', JSON.stringify({
      mediaConvertRole: mediaConvertRole.roleArn
    }), env);
    return [instanceRole, batchServiceRole];
  }

  // create instance profile for the instance role in a computeEnvironment
  protected createComputeEnvironmentProfile(instanceRole: iam.Role) {
    const instanceProfile = new iam.CfnInstanceProfile(this, 'InstanceProfile', {
      roles: [instanceRole.roleName],
      instanceProfileName: `H265EncodingInstanceRole-${AppContext.getInstance().env}`
    });
    return instanceProfile;
  }
    
  protected createComputeEnvironment(vpc: ec2.IVpc, batchServiceRole: iam.Role, instanceProfile: iam.CfnInstanceProfile, 
    tags: string, minCPUs: number, maxCPUs: number, dCPUs: number, dEBSSize: number, InstanceSize: ec2.InstanceSize) {
    const env = AppContext.getInstance().env;

    // In order to set volumesize for EBS, use LaunchTemplate
    const myLaunchTemplate = new ec2.CfnLaunchTemplate(this, `LaunchTemplate-EC2-${tags}-${dEBSSize}`, {
      launchTemplateName: `storage-template-${tags}-${dEBSSize}`,
      launchTemplateData: {
        blockDeviceMappings: [
        {
          deviceName: `/dev/xvda`,
          ebs: {
            encrypted: true,
            volumeSize: dEBSSize,   // GiB
            volumeType: 'gp2',
          }
        }]
      }
    });

    // create computeEnvironment
    const computeEnvironment = new batch.ComputeEnvironment(this, `ComputeEnvironment-EC2-${tags}-${dEBSSize}`, {
      serviceRole: batchServiceRole,  // The IAM role used by Batch to make calls to other AWS services on your behalf 
                                      // for managing the resources that you use with the service.
      managed: true,                  // Determines if AWS should manage the allocation of compute resources for processing jobs.
      computeResources: {
        vpc: vpc,
        type: batch.ComputeResourceType.ON_DEMAND,
        allocationStrategy: batch.AllocationStrategy.BEST_FIT,  // The allocation strategy to use for the compute resource in case 
                                                                // not enough instances of the best fitting instance type can be allocated.
        launchTemplate: {
          launchTemplateName: myLaunchTemplate.launchTemplateName as string, //or simply use an existing template name
        },
        minvCpus: minCPUs,
        maxvCpus: maxCPUs,
        desiredvCpus: dCPUs,
        instanceTypes: [
          ec2.InstanceType.of(ec2.InstanceClass.C5, InstanceSize)
        ],
        instanceRole: instanceProfile.ref,
        computeResourcesTags: { // auto-tagging in EC2
          'map-migrated': 'd-server-xxxxxxxxxxxxxxx',
          'Project': AppContext.getInstance().appName,
          'Name': `EC2-encsys-${tags}`,
          'DeployEnvironment': env
        }
        // todo: security group
      },
      computeEnvironmentName: `CE-${tags}-EC2-${dEBSSize}MBi`
    });

    cdk.Tags.of(computeEnvironment).add('map-migrated', 'd-server-xxxxxxxxxxxxxxx');
    cdk.Tags.of(computeEnvironment).add('Project', AppContext.getInstance().appName);
    cdk.Tags.of(computeEnvironment).add('DeployEnvironment', env);
    cdk.Tags.of(computeEnvironment).add('Name', `encsys-${tags}`);

    return computeEnvironment;
  }

  protected  createJobQueue(computeEnvironment: batch.IComputeEnvironment, tags: string, comput_order: number, batch_order: number) {
    const env = AppContext.getInstance().env;
    const jobQueue = new batch.JobQueue(this, `${tags}Queue-${env}`, {
      computeEnvironments: [  // map into computeEnvironments and order
        {
          computeEnvironment: computeEnvironment,
          order: comput_order
        }
      ],
      priority: batch_order, // dev: 2 , prod: 1
      // jobQueueName // 정의 안할게요
      jobQueueName: `JQ-${env}-${tags}`,
    });

    cdk.Tags.of(jobQueue).add('map-migrated', 'd-server-xxxxxxxxxxxxxxx');
    cdk.Tags.of(jobQueue).add('Project', `${AppContext.getInstance().appName}-${env}`);
    cdk.Tags.of(jobQueue).add('Name', `${tags}Queue`);
    cdk.Tags.of(jobQueue).add('DeployEnvironment', env);

    return jobQueue;
  }

  protected createJobDefinition(EcrRepository: ecr.IRepository, tags: string, vcpus: number, memorylimit: number) {
    const env = AppContext.getInstance().env;
    const jobDef = new batch.JobDefinition(this, `${tags}JobDef-${env}`, {
      container: {
        image: ecs.ContainerImage.fromEcrRepository(EcrRepository, 'latest'),
        vcpus: vcpus,               // the number of vCPUs
        memoryLimitMiB: memorylimit,// memory(MiB)
        environment: {
            'source': 'skb-media-prod-input',
            'destination': 'skb-origin-backup',
        },
        privileged: true, // When this parameter is true, the container is given elevated privileges
                          // on the host container instance (similar to the root user).
      },
      jobDefinitionName: `JD-${env}-${tags}`,
      retryAttempts: 3,   // The number of times to move a job to the RUNNABLE status
      
      timeout: cdk.Duration.hours(3)  // The timeout configuration for jobs that are submitted with this job definition.
    });
    cdk.Tags.of(jobDef).add('map-migrated', 'd-server-xxxxxxxxxxxxxxx');
    cdk.Tags.of(jobDef).add('Project', `${AppContext.getInstance().appName}-${env}`);
    cdk.Tags.of(jobDef).add('Name', `${tags}JobDef`);
    cdk.Tags.of(jobDef).add('DeployEnvironment', env);

    return jobDef;
  }
  
  protected createbatchFargate(props: StackProps, batchServiceRole: iam.Role, instanceRole: iam.Role, 
    ECRrepos: string, name: string, ComputeEnv_maxCPU: number, Container_vcpu: string, 
    Container_memory: string, comput_order:number, batch_order:number) {
    const app = AppContext.getInstance().appName;
    const account = cdk.Stack.of(this).account
    const region = cdk.Stack.of(this).region
    const env = AppContext.getInstance().env;
    const encoderEcrRepository= ecr.Repository.fromRepositoryName(this, `ecrRepoFargate${name}`, `${ECRrepos}`);
    
    // generate computer environment for encoder
    const computeEnvironmentEncoder = this.createComputeEnvironmentFargateSpot(props.vpc, batchServiceRole, 
      `${env}-${name}`, ComputeEnv_maxCPU); 

    // generate job queue and job definition for encoder
    const encoderJobQueue = this.createJobQueueFargate(computeEnvironmentEncoder, name, comput_order, batch_order);
    const encoderJob = this.createJobDefinitionFargate(encoderEcrRepository, instanceRole, name, Container_vcpu, Container_memory)

    this.putParameter(`Batch${name}-FGS`, JSON.stringify({
      jobQueueName: encoderJobQueue.jobQueueName,
      jobDefinitionName: encoderJob.jobDefinitionName
    }), env);

    // print JobQueue and JebDefi    
    new cdk.CfnOutput(this, `JobQueueFargate${name}`, { value: encoderJobQueue.ref });
    new cdk.CfnOutput(this, `JobDefinitionFargate${name}`, { value: encoderJob.ref });
  }

  protected createComputeEnvironmentFargateSpot(vpc: ec2.IVpc, batchServiceRole: iam.Role,  
    tags: string, maxCPUs: number) {
    
    const env = AppContext.getInstance().env
    const sg = new ec2.SecurityGroup(this, `sg-${tags}`, {
        securityGroupName: `batch-sg-${tags}`,
        vpc
    });  
    // refer to https://docs.aws.amazon.com/ko_kr/batch/latest/userguide/fargate.html
    const computeEnvironment = new batch.CfnComputeEnvironment(this, `ComputeEnvironment-${tags}-FargateSpot`, {
      type: 'MANAGED',
      serviceRole: batchServiceRole.roleArn,
      computeResources: {
        type: 'FARGATE_SPOT',
        maxvCpus: maxCPUs,
        subnets: vpc.selectSubnets({subnetType: ec2.SubnetType.PRIVATE}).subnetIds,
        securityGroupIds: [sg.securityGroupId] // shoud
      },
      computeEnvironmentName: `CE-${tags}-FGS-20MBi`,
    });

    cdk.Tags.of(computeEnvironment).add('map-migrated', 'd-server-xxxxxxxxxxxxxxx');
    cdk.Tags.of(computeEnvironment).add('Project', AppContext.getInstance().appName);
    cdk.Tags.of(computeEnvironment).add('DeployEnvironment', env);
    cdk.Tags.of(computeEnvironment).add('Name', `encsys-Fargate-${tags}`);

    return computeEnvironment;
  }

  protected createJobQueueFargate(computeEnvironment: batch.CfnComputeEnvironment, tags: string, comput_order:number, batch_order: number) {
    const env = AppContext.getInstance().env
    const jobQueue = new batch.CfnJobQueue(this, `${tags}Queue-Fargate-${env}`, {
      computeEnvironmentOrder: [
        {
          computeEnvironment: computeEnvironment.computeEnvironmentName as string,
          order: comput_order,
        }
      ],
      priority: batch_order,
      jobQueueName: `JQ-${env}-${tags}-FGS`,
    });

    cdk.Tags.of(jobQueue).add('map-migrated', 'd-server-xxxxxxxxxxxxxxx');
    cdk.Tags.of(jobQueue).add('Project', `${AppContext.getInstance().appName}-${env}`);
    cdk.Tags.of(jobQueue).add('Name', `${tags}Queue`);
    cdk.Tags.of(jobQueue).add('DeployEnvironment', env);
    jobQueue.addDependsOn(computeEnvironment)

    return jobQueue;
  }
  protected createJobDefinitionFargateRole() {
    const env = AppContext.getInstance().env
    return new iam.Role(this, 'ECSTaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      roleName: `FargateECSTaskExecRole-${env}`,
      managedPolicies: [
        iam.ManagedPolicy.fromManagedPolicyArn(this, 'AmazonECS_FullAccess2', 'arn:aws:iam::aws:policy/AmazonECS_FullAccess'),
        iam.ManagedPolicy.fromManagedPolicyArn(this, 'EC2InstanceProfileForImageBuilderECRContainerBuilds2', 'arn:aws:iam::aws:policy/EC2InstanceProfileForImageBuilderECRContainerBuilds'),
        iam.ManagedPolicy.fromManagedPolicyArn(this, 'AWSElementalMediaConvertFullAccess2', 'arn:aws:iam::aws:policy/AWSElementalMediaConvertFullAccess'),
        iam.ManagedPolicy.fromManagedPolicyArn(this, 'CloudWatchFullAccess2', 'arn:aws:iam::aws:policy/CloudWatchFullAccess'),
        iam.ManagedPolicy.fromManagedPolicyArn(this, 'AmazonS3FullAccess2', 'arn:aws:iam::aws:policy/AmazonS3FullAccess'),
        iam.ManagedPolicy.fromManagedPolicyArn(this, 'AmazonECSTaskExecutionRolePolicy', 'arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy'),
        iam.ManagedPolicy.fromManagedPolicyArn(this, 'AmazonSSMManagedInstanceCore', 'arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore'),
        iam.ManagedPolicy.fromManagedPolicyArn(this, 'SecretsManagerReadWrite', 'arn:aws:iam::aws:policy/SecretsManagerReadWrite'),
        iam.ManagedPolicy.fromManagedPolicyArn(this, 'AWSBatchServiceEventTargetRole2', 'arn:aws:iam::aws:policy/service-role/AWSBatchServiceEventTargetRole'),
      ]
    })
  }

  protected createJobDefinitionFargate(EcrRepository: ecr.IRepository, instanceRole: iam.Role, tags: string, vcpu: string, memory: string) {
    const env = AppContext.getInstance().env
    
    // refer to https://docs.aws.amazon.com/ko_kr/batch/latest/userguide/fargate.html
    const jobDef = new batch.CfnJobDefinition(this, `${tags}JobDef-Fargate-${env}`, {
      platformCapabilities: ['FARGATE'],
      type: "Container",
      containerProperties: {
        image: ecs.ContainerImage.fromEcrRepository(EcrRepository, 'latest').imageName,
        executionRoleArn: instanceRole.roleArn,
        // refer to https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-cpu-memory-error.html
        resourceRequirements: [
          {type: 'MEMORY', value: memory},
          {type: 'VCPU', value: vcpu}
        ],     
        logConfiguration: {
          logDriver: 'awslogs',
          options: {
            'awslogs-stream-prefix': `${tags}JobDef-Fargate-${env}`,
          }
        },            
        environment: [
            {name: 'source', value: 'skb-media-prod-input'},
            {name: 'destination', value: 'skb-origin-backup'},
        ],   
      },
      jobDefinitionName: `JD-${env}-${tags}-FGS`,
      retryStrategy: {
        attempts: 3,
      },
      timeout: {
        attemptDurationSeconds: 7200
      },
    });
    cdk.Tags.of(jobDef).add('map-migrated', 'd-server-xxxxxxxxxxxxxxx');
    cdk.Tags.of(jobDef).add('Project', `${AppContext.getInstance().appName}-${env}`);
    cdk.Tags.of(jobDef).add('Name', `${tags}JobDef`);
    cdk.Tags.of(jobDef).add('DeployEnvironment', env);

    return jobDef;
  }
}