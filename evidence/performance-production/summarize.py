import json,statistics,math
from pathlib import Path
p=Path('evidence/performance-production');d=json.loads((p/'report.json').read_text())
rows=[]
fields=['ttfbMs','fcpMs','completedHttpRequestCount','completedRequestCount','completedWireBytes','actualNetworkRequests','cachedRequests','fontsRequested','fontWireBytes','domNodes','longTaskCount','longTaskTotalMs','longestTaskMs','lcpMs']
for s in d['samples']:
 tasks=s.get('longtasks',[]);s.update(longTaskCount=len(tasks),longTaskTotalMs=sum(t['duration'] for t in tasks),longestTaskMs=max([0]+[t['duration'] for t in tasks]),lcpMs=(s.get('lcp')or{}).get('startTime'))
for label in ['dashboard','people']:
 for phase in ['cold','repeat']:
  row={'label':label,'phase':phase,'variants':{}}
  for variant in ['baseline','final']:
   ss=[s for s in d['samples'] if s['label']==label and s['phase']==phase and s['variant']==variant]
   stats={}
   for field in fields:
    values=sorted(s[field] for s in ss if s.get(field)is not None)
    stats[field]={'n':len(values),'median':statistics.median(values) if values else None,'p95':values[math.ceil(.95*len(values))-1] if values else None,'min':min(values) if values else None,'max':max(values) if values else None}
   row['variants'][variant]=stats
  rows.append(row)
trace=[json.loads(x) for x in (p/'network-trace.jsonl').read_text().splitlines() if x]
api=[x for x in trace if x['kind']=='fixture-api' and d['startedAt']<=x['time']<=d['finishedAt']]
summary={'sources':d['variants'],'result':d.get('result'),'sampleCount':len(d['samples']),'statistics':'Median and nearest-rank p95 of seven observations; p95=max at n7, descriptive only','rows':rows,'backendTrace':{'totalCalls':len(api),'callsByOrigin':{origin:len([x for x in api if x.get('forwardedOrigin')==origin]) for origin in ['https://portal-perf.test:3443','https://portal-perf.test:3444']},'sessionCalls':len([x for x in api if x['path'].startswith('/api/auth/session')]),'viewCalls':len([x for x in api if x['path'].startswith('/api/portal?')]),'statuses':sorted(set(x['status'] for x in api))},'errors':d['errors'],'externalPageAttempts':d['externalAttempts']}
(p/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
for r in rows:
 print(r['label'],r['phase'])
 for v,s in r['variants'].items():print(v,{k:s[k]['median'] for k in ['ttfbMs','fcpMs','lcpMs','completedWireBytes','completedRequestCount','cachedRequests','longTaskTotalMs']})
print(summary['backendTrace'])
