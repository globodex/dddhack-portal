"""Correct only HTTP-cache counters; retain all raw timing/request/byte records."""
import json,hashlib
from pathlib import Path
p=Path('evidence/performance-production');raw=p/'raw-report-before-http-counter-correction.json';d=json.loads(raw.read_text())
assert len(d['samples'])==56 and d.get('browserClosed') is True
errors=d['errors'];assert len(errors)==1 and 'Cold samples must have zero HTTP cache hits' in errors[0]['error']
for section in ['samples','serverCold','warmup']:
 for s in d[section]:
  http=[r for r in s['requests'] if r['url'].startswith(('http://','https://'))]
  s['rawCachedRequestsIncludingInline']=s['cachedRequests'];s['rawActualNetworkRequestsIncludingInline']=s['actualNetworkRequests']
  s['completedHttpRequestCount']=len(http);s['inlineRequestCount']=len(s['requests'])-len(http)
  s['cachedRequests']=sum(bool(r.get('servedFromCache')or r.get('fromDiskCache')) for r in http)
  s['actualNetworkRequests']=len(http)-s['cachedRequests']
assert not d['externalAttempts']
assert all(s['cachedRequests']==0 for s in d['samples'] if s['phase']=='cold')
assert all(s['cachedRequests']>0 for s in d['samples'] if s['phase']=='repeat')
assert all(s['httpStatus']==200 and s['initialApiRequests']==0 for s in d['samples'])
d['rawValidationErrors']=errors;d['errors']=[];d['rawResult']=d['result'];d['result']='PASS56'
d['postprocessing']={'rawReport':raw.name,'rawReportSha256':hashlib.sha256(raw.read_bytes()).hexdigest(),'rawRunner':'measure-production.raw-runner.mjs','rawRunnerSha256':hashlib.sha256((p/'measure-production.raw-runner.mjs').read_bytes()).hexdigest(),'correction':'Inline data:image fixture emits servedFromCache even with HTTP cache disabled. HTTP-only cache counters exclude non-HTTP entries. Full request records, wire totals, navigation timing, paint, long tasks and original raw report are unchanged. No browser rerun or data filtering of timing samples.','validator':'All28 HTTP-cold rows have0HTTP cache hits; all28 repeat rows have native HTTP cache hits; all56 initial API counts0/status200.'}
d['method']['httpRequestCounts']='completedHttpRequestCount and actualNetworkRequests/cachedRequests exclude data/blob URLs; completedRequestCount retains raw CDP completed entries including inline fixture image.'
(p/'report.json').write_text(json.dumps(d,indent=2)+'\n')
print(json.dumps({'result':d['result'],'samples':len(d['samples']),'errors':d['errors'],'browserClosed':d['browserClosed'],'httpColdCacheHits':sum(s['cachedRequests'] for s in d['samples'] if s['phase']=='cold')}))
