# The cloud-based test system for AWS IaC

This is a project for TypeScript development with CDK.

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## How to deploy stack
```bash
# deploy all stacks to 'dev'
$ cdk deploy '*' -c env=dev
$ cdk deploy VpcStackdev-test -c env=dev-test

# deploy specific stack to 'prod'
$ cdk deploy VpcStackprod -c env=prod
```

## Useful commands

 * `npm run build`   compile typescript to js
 * `npm run watch`   watch for changes and compile
 * `npm run test`    perform the jest unit tests
 * `cdk deploy`      deploy this stack to your default AWS account/region
 * `cdk diff`        compare deployed stack with current state
 * `cdk synth`       emits the synthesized CloudFormation template
