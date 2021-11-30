import json

s = "{\n \"source\": \"skb-media-prod-input\",\n \"destination\": \"skb-origin-backup\",\n}"
s = s.replace('\t','')
s = s.replace('\n','')
s = s.replace(',}','}')
s = s.replace(',]',']')
print(s)
A = json.loads(s)
print(A['source'])
