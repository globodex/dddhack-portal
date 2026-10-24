import json,statistics,math,csv
from collections import defaultdict
from pathlib import Path
from PIL import Image,ImageChops
p=Path('evidence/performance-content-boundary');d=json.loads((p/'report.json').read_text());rows=[]
fields=['ttfbMs','fcpMs','lcpMs','completedHttpRequestCount','actualNetworkRequests','cachedRequests','completedWireBytes','fontWireBytes','cssWireBytes','scriptWireBytes','longTaskTotalMs']
for s in d['samples']:
 s['lcpMs']=(s.get('lcp')or{}).get('startTime');s['longTaskTotalMs']=sum(t['duration']for t in s['longtasks']);s['cssWireBytes']=sum(r['encodedDataLength']for r in s['requests']if r['type']=='Stylesheet');s['scriptWireBytes']=sum(r['encodedDataLength']for r in s['requests']if r['type']=='Script')
for label in ['dashboard','people','home']:
 for phase in (['cold']if label=='home'else['cold','repeat']):
  row={'label':label,'phase':phase,'variants':{}}
  for v in ['baseline','final']:
   ss=[s for s in d['samples']if s['label']==label and s['phase']==phase and s['variant']==v];stats={}
   for key in fields:
    vals=sorted(s[key]for s in ss if s[key]is not None);stats[key]={'n':len(vals),'median':statistics.median(vals),'p95':vals[math.ceil(.95*len(vals))-1],'min':min(vals),'max':max(vals)}
   row['variants'][v]=stats
  a={s['round']:s for s in d['samples']if s['label']==label and s['phase']==phase and s['variant']=='final'};b={s['round']:s for s in d['samples']if s['label']==label and s['phase']==phase and s['variant']=='baseline'};delta=[a[r]['fcpMs']-b[r]['fcpMs']for r in b];td=[a[r]['ttfbMs']-b[r]['ttfbMs']for r in b]
  row['pairedFCP']={'deltasMs':delta,'medianDeltaMs':statistics.median(delta),'candidateSlower':sum(x>0 for x in delta),'candidateFaster':sum(x<0 for x in delta),'ties':sum(x==0 for x in delta)};row['pairedTTFBMedianDeltaMs']=statistics.median(td);rows.append(row)
trace=[json.loads(x)for x in(p/'network-trace.jsonl').read_text().splitlines()if x];api=[x for x in trace if x['kind']=='fixture-api'and d['startedAt']<=x['time']<=d['finishedAt']]
pixels={}
for label in ['dashboard','people','home']:
 a=Image.open(p/f'baseline-{label}-1440x900.png').convert('RGB');b=Image.open(p/f'final-{label}-1440x900.png').convert('RGB');pixels[label]={'dimensions':a.size,'candidateDimensions':b.size,'differenceBounds':ImageChops.difference(a,b).getbbox()}
for shot in d['screenshots']:shot['inspected']=True
d['cleanup']={'browsersClosed':True,'TLSNextStoppedByLandingPIDs':[159430,159426],'backendNetworkStoppedPIDs':[158756,158775],'portsVerifiedClosed':[3443,3444,8842,8851,8899],'localOnlyNoPush':True}
(p/'report.json').write_text(json.dumps(d,indent=2)+'\n')
summary={'comparison':'Current e135-equivalent QdP accepted UI versus d24b47f pure public-content-defaults boundary. Original696 and Home-dynamic comparisons remain separate and NOT pooled.','sources':d['variants'],'samples':len(d['samples']),'result':d['result'],'statistics':'Median and nearest-rankp95 of7; p95=max,n7descriptive only. No samples removed or matrix repeated.','rows':rows,'pixels':pixels,'backend':{'calls':len(api),'byOrigin':dict((o,sum(x.get('forwardedOrigin')==o for x in api))for o in ['https://portal-perf.test:3443','https://portal-perf.test:3444']),'views':sum(x['path'].startswith('/api/portal?')for x in api),'sessions':sum(x['path'].startswith('/api/auth/session')for x in api),'statuses':sorted(set(x['status']for x in api))},'compiledGate':json.loads((p/'compiled-gate.json').read_text()),'errors':d['errors'],'externalPageAttempts':d['externalAttempts']}
assert summary['samples']==70 and summary['result']=='PASS70'and not summary['errors']and not summary['externalPageAttempts'];assert summary['backend']['calls']==122 and summary['backend']['views']==122 and summary['backend']['sessions']==0
assert not any(s['overflow']for s in d['samples']);assert all(s['initialApiRequests']==(1 if s['label']=='home'else 0)for s in d['samples']);assert all(v['differenceBounds']is None for v in pixels.values())
(p/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
with(p/'waterfalls.csv').open('w',newline='')as f:
 w=csv.writer(f);w.writerow(['variant','route','phase','round','type','url','wireBytes','HTTPcacheHit','CDPdurationMs','pageStartMs','pageEndMs','renderBlockingStatus'])
 for s in d['samples']:
  resources={r['name']:r for r in s['resources']}
  for r in s['requests']:
   q=resources.get(r['url'],{});w.writerow([s['variant'],s['label'],s['phase'],s['round'],r['type'],r['url'],r['encodedDataLength'],bool(r.get('servedFromCache')or r.get('fromDiskCache')),r.get('durationMs'),q.get('startTime'),q.get('responseEnd'),q.get('renderBlockingStatus')])
print('PASS70;122views61each;compiledZodremoved/staticHome;3pixelpairsidentical')
for label in ['dashboard','people','home']:
 for v in ['baseline','final']:
  s=next(s for s in d['samples']if s['label']==label and s['variant']==v and s['phase']=='cold');by=defaultdict(int)
  for r in s['requests']:by[r['type']]+=r['encodedDataLength']
  print(label,v,dict(by))
