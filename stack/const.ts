import * as cdk from '@aws-cdk/core';

const app = new cdk.App();
const env = app.node.tryGetContext("env")==undefined?'dev':app.node.tryGetContext("env");

let vpc = {
    CIRD : '10.0.0.0/16',
    cidrMask : 24
}

// for stag and prod stack
if (env != 'dev') {
    vpc = {
        CIRD : '11.0.0.0/16',
        cidrMask : 24
    }    
} 

export const devvpc = vpc