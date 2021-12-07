import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';

const app = new cdk.App();
const env = app.node.tryGetContext("env")==undefined?'dev':app.node.tryGetContext("env");

let vpc = {
    CIRD : '10.0.0.0/16',
    cidrMask_public : 24,
    cidrMask_private : 24
}
let batchEC2 = {
    minCPUs : 0,
    maxCPUs : 32,
    desiredCPUs : 0,
    InstanceSize : ec2.InstanceSize.XLARGE4,
    volumeSize: 100,
    container_vCPUs: 16,
    container_memory: 16384,
    comput_order : 1,
    batch_order : 1,
}

let batchFGS = {
    maxCPUs : 96,
    container_vCPUs: '4',
    container_memory: '16384',
    comput_order : 2,
    batch_order : 2,
}

// for stag and prod stack
if (env != 'dev') {
    vpc = {
        CIRD : '10.0.0.0/16',
        cidrMask_public : 20,
        cidrMask_private : 24
    }    
    batchEC2 = {
        minCPUs : 4,
        maxCPUs : 12,
        desiredCPUs : 4,
        InstanceSize : ec2.InstanceSize.XLARGE,
        volumeSize: 100,
        container_vCPUs: 1,
        container_memory: 512,
        comput_order : 2,
        batch_order : 2,
    }
    batchFGS = {
        maxCPUs : 96,
        container_vCPUs: '0.25',
        container_memory: '512',
        comput_order : 2,
        batch_order : 2,
    }
} 

export const devvpc = vpc
export const batch_ec2 = batchEC2
export const batch_fargate_spot = batchFGS
export const appName = 'skt'
export const keypair = 'test-prd'
export const batch_prefix = "CopyS3"
export const batch_computingEnv = "EC2"
export const batch_repository = "test-copys3"
export const batch_branch = "master"
export const slack_channel = "test"