import boto3
import os

def lambda_handler(event, _context):
    ids = []
    ec2 = boto3.resource('ec2')
    #print(event)

    if event['detail']['event'] == 'createVolume': # if createVolume,
        ids.append(event['resources'][0].split('/')[1])
        print('volumn_id:', event['resources'][0].split('/')[1])
    else:
        print('Not supported action')
    
    if ids: # add tags
        ec2.create_tags(Resources=ids, Tags= [
            {'Key': 'map-migrated', 'Value': 'd-server-xxxxxxxxxxxx}, 
            {'Key': 'Project', 'Value': os.environ['APP_NAME']},
            {'Key': 'DeployEnvironment', 'Value': 'dev'},
        ])
    
    return {'message':'TaggingEBS'}