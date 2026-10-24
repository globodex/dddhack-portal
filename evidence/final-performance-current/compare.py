"""Compare the same28-sample read-only method; never infer hosted speed."""
from pathlib import Path
from statistics import median
import json
root=Path(__file__).resolve().parents[2]
before=json.loads((root/'evidence/redesign-rich-before/report.json').read_text())
after=json.loads((root/'evidence/final-performance-current/report.json').read_text())
fields=['completedWireBytes','completedRequestCount','ttfbMs','fcpMs','domNodes']
summary=[]
for path in dict.fromkeys(row['path'] for row in before['metrics']):
 versions=[]
 for report in [before,after]:
  data=[row for row in report['metrics'] if row['path']==path and row['viewport']['width']==1440]
  versions.append({field:round(median(row[field] for row in data),2) for field in fields})
 summary.append({'route':path,'desktopSamplesPerVersion':3,'before':versions[0],'after':versions[1],'wireBytesChangePercent':round(100*(versions[1]['completedWireBytes']/versions[0]['completedWireBytes']-1),2)})
result={'beforeSource':before['source'],'afterSource':after['source'],'beforeReport':'evidence/redesign-rich-before/report.json','afterReport':'evidence/final-performance-current/report.json','sameFixtureBackend':8789,'sameBundler':'Next16.4.3 development webpack','freshBrowserContexts':True,'httpCacheDisabled':True,'baselineSamples':len(before['metrics']),'finalSamples':len(after['metrics']),'finalErrors':after['errors'],'finalBlockedRequests':after['blocked'],'initialBrowserApiRequestsBefore':sum(len(r['apiRequests']) for r in before['metrics']),'initialBrowserApiRequestsAfter':sum(len(r['apiRequests']) for r in after['metrics']),'desktopMedians':summary,'limitations':['Development, unthrottled local process,3desktop samples and1mobile sample per route; raw compilation outliers retained.','Original baseline and current server caches/background conditions differed; no hosted latency or speed improvement inferred. Current run waits for tests/build to finish.','Admin default filters changed from empty Registered+Locked to populated All; initial DOM counts are not equivalent content.','CDP completed requests include inline data-image records; bytes are observed encodedDataLength at sample time, not production compression. Later screenshot/tab actions may append request records after the numeric sample.','Mobile results are one observation per route, not percentiles.']}
(root/'evidence/final-performance-current/comparison.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'rows':len(summary),'samples':len(after['metrics']),'errors':len(after['errors']),'blocked':len(after['blocked'])}))
