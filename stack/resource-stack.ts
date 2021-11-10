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

    // create S3 buckets such as input/temp/output/error/system-settings
    this.createMediaBucket(`SKBEncodingSysBucketInput`, `input`, false, env)
    this.createMediaBucket(`SKBEncodingSysBucketTemp`, `temp`, false, env)
    this.createMediaBucket(`SKBEncodingSysBucketOutput`, `output`, false, env)
    this.createMediaBucket(`SKBEncodingSysBucketError`, `error`, false, env)
    this.createMediaBucket(`SKBEncodingSysBucketSystemSetting`, `system-settings`, true, env) // versioned s3
  }

  private createMediaBucket(stackName: string, buckename: string, ver: boolean, env: string)
  {
    // s3 bucket creation
    this.mcBucket = new s3.Bucket(this, `${stackName}${env}`, {
      bucketName: `${AppContext.getInstance().appName}-${env}-${buckename}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY, 
      versioned: ver, // manage to version s3 data
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,  
    });

    // auto-tagging for s3
    cdk.Tags.of(this.mcBucket).add('map-migrated', 'd-server-00wkp68bblxi7u');
    cdk.Tags.of(this.mcBucket).add('Project', AppContext.getInstance().appName);
    cdk.Tags.of(this.mcBucket).add('DeployEnvironment', AppContext.getInstance().env);
    cdk.Tags.of(this.mcBucket).add('Name', `encsys-bucket-${buckename}`);
  }
}
