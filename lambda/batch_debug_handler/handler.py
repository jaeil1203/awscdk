import boto3
import json
import urllib3, os
http = urllib3.PoolManager()

client = boto3.client('logs')

def get_err_info(event):

    event_jobName           = None
    event_jobId             = None
    event_statusReason      = None
    event_logStreaName      = None

    if 'detail' in event and 'jobId' in event['detail']:
        event_jobId = event['detail']['jobId']
        if ':' in event_jobId[-4:]:
            event_jobId = event_jobId.split(':')[0]

    if 'detail' in event and 'jobName' in event['detail']:
        event_jobName = event['detail']['jobName']

    if 'detail' in event and 'statusReason' in event['detail']:
        event_statusReason = event['detail']['statusReason']
    
    if 'attempts' in event['detail']:
        if len(event['detail']['attempts']) > 0:
            if 'container'  in event['detail']['attempts'][0]:
                if 'logStreamName' in event['detail']['attempts'][0]['container']:
                    event_logStreaName = event['detail']['attempts'][0]['container']['logStreamName']
    
    if ("Array Child Job failed" in event_statusReason) | \
        ("Dependent Job failed" in event_statusReason):
        return None
    
    if event_logStreaName == None:     # if no log events,
        info = '  JobName: '+ event_jobName + \
            '\n  Error Message: '   + event_statusReason + \
            '\n  Link: ' + 'https://ap-northeast-2.console.aws.amazon.com/batch/home?region=ap-northeast-2#jobs/detail/'+event_jobId + \
            '\n  CloudWatchLogs: '+ 'No log events'

    else: # if there are log events,
        print(event_logStreaName)
        event_out_logstreamName = event_logStreaName.split('/')[0]+ '/' + event_jobName

        # move log events to batch-error
        response = client.get_log_events(
            logGroupName='/aws/batch/job',
            logStreamName=event_logStreaName,
        )
        events=[]
        for event in response['events']:
            del event["ingestionTime"]
            events.append(event)
        response = client.create_log_stream(
            logGroupName='/aws/batch/job-'+os.environ['ENV']+'-error',
            logStreamName=event_out_logstreamName
        )
        client.put_log_events(
            logGroupName='/aws/batch/job-'+os.environ['ENV']+'-error',
            logStreamName=event_out_logstreamName,
            logEvents = events
        )
        
        info = '  JobName: '+ event_jobName + \
            '\n  Error Message: '   + event_statusReason + \
            '\n  Link: ' + 'https://'+os.environ['region']+'.console.aws.amazon.com/batch/home?region='+os.environ['region']+'#jobs/detail/'+event_jobId + \
            '\n  CloudWatchLogs: '+ 'https://'+os.environ['region']+'.console.aws.amazon.com/cloudwatch/home?region='+os.environ['region']+'#logsV2:log-groups/log-group/$252Faws$252Fbatch$252Fjob-'+ os.environ['ENV']+'-error/log-events/'+event_out_logstreamName.replace("/","$252F")

    return info

# Hook url and channel for mpd workspace in slack
ENCRYPTED_HOOK_URL = "https://hooks.slack.com/services/xxxxxxxxx/xxxxxxxxxx/xxxxxxxxxxxxxx"
SLACK_CHANNEL = "aws-error-notice"

def lambda_handler(event, context):
    if event["source"] == "aws.batch":
        url = ENCRYPTED_HOOK_URL
        
        err_info = get_err_info(event)
        alarm_name = '<Batch Job Failed - %s>\n' % (os.environ['ENV'])

        if err_info == None:
            print({
                'channel': SLACK_CHANNEL,
                'username': 'Jaeil Kim',
                'text': "%s: %s" % (alarm_name, "\nNo Notification")
            })
        else:
            slack_message = {
                'channel': SLACK_CHANNEL,
                'username': 'Jaeil Kim',
                'text': "%s%s" % (alarm_name, err_info)
            }
            encoded_msg = json.dumps(slack_message).encode('utf-8')
            
            req = http.request('POST', url, body=encoded_msg)
            print({
                'channel': SLACK_CHANNEL,
                'username': 'Jaeil Kim',
                'text': "%s: %s" % (alarm_name, err_info)
            })