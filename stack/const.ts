import * as cdk from '@aws-cdk/core';

const app = new cdk.App();
const env = app.node.tryGetContext("env")==undefined?'dev':app.node.tryGetContext("env");

let vpc = {
    CIRD : '10.0.0.0/16',
    cidrMask_public : 24,
    cidrMask_private : 24
}

// for stag and prod stack
if (env != 'dev') {
    vpc = {
        CIRD : '10.0.0.0/16',
        cidrMask_public : 20,
        cidrMask_private : 24
    }    
} 

export const devvpc = vpc
export const keypair = 'test-prd'