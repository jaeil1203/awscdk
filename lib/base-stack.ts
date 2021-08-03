import * as cdk from '@aws-cdk/core';
import * as ssm from '@aws-cdk/aws-ssm'
import { AppContext } from './app-context';

export class BaseStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
  }

  protected putParameter(key: string, value: string, description?: string): ssm.StringParameter {
    // need to fix parameter path based on your company's rule
    const projectKey = `/${AppContext.getInstance().appName}/${AppContext.getInstance().env}/${key}`;
    const ssm_data = new ssm.StringParameter(this, `${key}Param`, {
      parameterName: projectKey,
      stringValue: value,
      description: description,
      tier: ssm.ParameterTier.STANDARD,
    });

    return ssm_data
  }    

  protected getParameter(key: string): string {
    const projectKey = `/${AppContext.getInstance().appName}/${AppContext.getInstance().env}/${key}`;
    return ssm.StringParameter.valueForStringParameter(
        this,
        projectKey
    );
  }
}
