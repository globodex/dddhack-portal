import json,gzip,statistics,csv
from collections import defaultdict
from pathlib import Path
p=Path('evidence/performance-production');d=json.loads((p/'report.json').read_text())
a={'method':'Offline inspection of the complete56-sample matrix and one separate Chrome timeline pervariant. No source change or causal A/B optimization trial.','routes':{},'traces':{}}
for label in ['dashboard','people']:
 route={'cold':{},'repeat':{}}
 for phase in ['cold','repeat']:
  for v in ['baseline','final']:
   ss=[s for s in d['samples'] if s['label']==label and s['phase']==phase and s['variant']==v]
   by=defaultdict(lambda:{'requests':[],'bytes':[]})
   for s in ss:
    keys=set(r['type'] for r in s['requests'])
    for key in keys:
     rr=[r for r in s['requests'] if r['type']==key];by[key]['requests'].append(len(rr));by[key]['bytes'].append(sum(r['encodedDataLength']for r in rr))
   route[phase][v]={'byType':{k:{'requestsMedian':statistics.median(x['requests']),'wireBytesMedian':statistics.median(x['bytes'])}for k,x in by.items()},'FCPbyRound':[{'round':s['round'],'fcpMs':s['fcpMs']}for s in ss]}
  before={s['round']:s for s in d['samples']if s['label']==label and s['phase']==phase and s['variant']=='baseline'}
  after={s['round']:s for s in d['samples']if s['label']==label and s['phase']==phase and s['variant']=='final'}
  delta=[after[r]['fcpMs']-before[r]['fcpMs']for r in before];route[phase]['pairedFCP']={'deltasMs':delta,'medianDeltaMs':statistics.median(delta),'finalSlowerPairs':sum(x>0 for x in delta),'pairs':len(delta)}
 a['routes'][label]=route
fonts=[]
for s in d['samples']:
 if s['label']=='dashboard'and s['phase']=='cold'and s['variant']=='final':
  r=next(x for x in s['resources']if '900-normal' in x['name']);css=[x for x in s['resources']if x.get('renderBlockingStatus')=='blocking']
  fonts.append({'round':s['round'],'font900StartMs':r['startTime'],'font900EndMs':r['responseEnd'],'lastBlockingCssEndMs':max(x['responseEnd']for x in css),'fcpMs':s['fcpMs'],'fontFinishedBeforeFCPms':s['fcpMs']-r['responseEnd']})
a['fontWaterfalls']=fonts
for v in ['baseline','final']:
 ev=json.loads(gzip.decompress((p/(v+'-dashboard-timeline.json.gz')).read_bytes()))['traceEvents'];threads={(e['pid'],e['tid']):e['args']['name']for e in ev if e.get('ph')=='M'and e.get('name')=='thread_name'}
 totals=defaultdict(float)
 for e in ev:
  if e.get('ph')=='X'and threads.get((e['pid'],e['tid']))=='CrRendererMain':totals[e['name']]+=e.get('dur',0)/1000
 a['traces'][v]={'inclusiveEventTotalsMs':{k:totals[k]for k in ['RunTask','Layout','UpdateLayoutTree','EvaluateScript','V8.CompileCode','ParseAuthorStyleSheet','Paint']},'limitation':'n1 diagnostic with tracing overhead; inclusive nested event durations overlap and must not be added. Not another timing benchmark.'}
a['conclusion']={'measured':'Dashboard cold medianFCP436→596ms, wire+53374bytes, slower6of7pairedcold visits. Cachedrepeat medianFCP132→132ms. People control cold432→460ms, repeat136→120ms.','fixedDashboardWireDelta':{'css':23310,'javascript':14385,'font':14595,'document':1084,'total':53374},'mechanismSupported':'Final serves5render-blocking stylesheets versus3; fixed extraCSS/JS/font transfer. A separate trace observes larger first-layout work but does not show JS execution slowing. Shared fixed backend still1projection/navigation,0initialbrowserAPI.','fontPreloadNotProven':'All7font900responses finish139–249ms beforeFCP. In trace900finishes1.8ms after the other finalfont, followed by10ms secondLayout, not a100msfont-swap penalty. No demonstrated preload fix for160msmedian cost.','visualConstraint':'Selected Studio target/actual use the heavy headline. Changing800CSS to700would stop matching900face and save14595bytes, but reduces accepted visual weight; no such change made.','scope':'GlobalCSS route splitting/deleting legacy overridden rules could reduce payload, but needs a separate measured implementation and cross-route visual/interaction verification. No speculative refactor in this bounded evidence lane.','status':'Performance comparison complete with an unresolved cold-load tradeoff; no blanket speed improvement or hosted performance guarantee.'}
(p/'attribution.json').write_text(json.dumps(a,indent=2)+'\n')
with (p/'waterfalls.csv').open('w',newline='')as f:
 w=csv.writer(f);w.writerow(['variant','route','phase','round','type','url','wireBytes','HTTPcacheHit','CDPdurationMs','pageStartMs','pageEndMs','renderBlockingStatus'])
 for s in d['samples']:
  resources={r['name']:r for r in s['resources']}
  for r in s['requests']:
   q=resources.get(r['url'],{});w.writerow([s['variant'],s['label'],s['phase'],s['round'],r['type'],r['url'],r['encodedDataLength'],bool(r.get('servedFromCache')or r.get('fromDiskCache')),r.get('durationMs'),q.get('startTime'),q.get('responseEnd'),q.get('renderBlockingStatus')])
for s in d['screenshots']:s['inspected']=True
d['cleanup']={'browsersClosed':True,'TLSNextStoppedByLandingPIDs':[143965,143961],'backendAndNetworkStoppedPIDs':[143771,143790],'noListeners':[3443,3444,8842,8851,8899],'fixtureAfterProfiling':'fixture-after-profiling.json','noPush':True}
(p/'report.json').write_text(json.dumps(d,indent=2)+'\n')
