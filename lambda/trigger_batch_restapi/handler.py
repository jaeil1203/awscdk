import json
import os
import boto3

ssm = boto3.client('ssm')
batch_client = boto3.client('batch')

def getParamsBatchJob(key, description):
    print('/'+os.environ['APP_NAME']+'/'+os.environ['ENV']+'/'+ key)
    parameter = ssm.get_parameter(Name='/'+os.environ['APP_NAME']+'/'+os.environ['ENV']+'/'+ key, WithDecryption=True)
    
    print(parameter)
    value = json.loads(parameter['Parameter']['Value']).get(description).split('/')[1]
    if ':' in value[-4:]: # remove version number
        value = value.split(':')[0]
    print(value)
    return value

#https://devstarsj.github.io/cloud/2016/11/24/AwsLambda.Python/
def handler(event, context): 
    print(event['body'])
    data = event['body']
    s = data.replace('\t','')
    s = s.replace('\n','')
    s = s.replace(',}','}')
    s = s.replace(',]',']')
    A = json.loads(s)
    print(A)
    print(A['source'])
    print(A['destination'])
    
    JobQueue = getParamsBatchJob('Batch'+os.environ['PREFIX']+'-'+os.environ['CMP'], "jobQueueName")
    JobDefinition = getParamsBatchJob('Batch'+os.environ['PREFIX']+'-'+os.environ['CMP'], "jobDefinitionName")

    print(JobQueue)
    print(JobDefinition)

    # submit job with env. variables
    response  = batch_client.submit_job(
        jobName = "Job-"+'2fda82a2-b7d1-11eb-a477-acde48001122',
        jobQueue = JobQueue,
        jobDefinition = JobDefinition,
        containerOverrides={
        'environment': [
            {'name': 'source','value': A['source']},
            {'name': 'destination','value': A['destination']},]      
        }  
    )
    print(response)

    return { 'body' : json.dumps(event) }  