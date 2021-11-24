import json

#https://devstarsj.github.io/cloud/2016/11/24/AwsLambda.Python/
def handler(event, context): 
    return { 'body' : json.dumps(event) }  