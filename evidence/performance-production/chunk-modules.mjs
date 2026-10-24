import {parse} from 'acorn';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
const roots={baseline:'/workspace/ddd-perf-prod-baseline',final:'/workspace/ddd-perf-prod-final'};
const report={method:'Parse existing compiled webpack chunk module objects without executing code. Raw minified module bytes and standalone gzip are diagnostics; gzip is not additive across modules. No maps/stats emitted by original build.',variants:{}};
for(const[variant,root]of Object.entries(roots)){
 const rd=JSON.parse(readFileSync('evidence/performance-production/report.json','utf8'));
 const row=rd.samples.find(s=>s.variant===variant&&s.label==='dashboard'&&s.phase==='cold');
 const files=row.requests.filter(r=>r.type==='Script').map(r=>({path:new URL(r.url).pathname.replace('/_next/',''),wire:r.encodedDataLength}));const chunks=[];
 for(const file of files){
  const code=readFileSync(root+'/.next/'+decodeURI(file.path),'utf8');const ast=parse(code,{ecmaVersion:'latest'});let mods;
  function walk(n){if(!n||typeof n!=='object')return;if(n.type==='CallExpression'&&n.callee?.type==='MemberExpression'&&n.callee.property?.name==='push'&&n.arguments[0]?.type==='ArrayExpression'&&n.arguments[0].elements[1]?.type==='ObjectExpression')mods=n.arguments[0].elements[1].properties;for(const[k,v]of Object.entries(n)){if(k==='start'||k==='end')continue;if(Array.isArray(v))for(const x of v)walk(x);else if(v&&typeof v==='object')walk(v);}}
  walk(ast);const modules=[];
  for(const p of mods||[]){const text=code.slice(p.value.start,p.value.end);modules.push({id:String(p.key.value??p.key.name),rawBytes:Buffer.byteLength(text),standaloneGzip:gzipSync(text).length,sha256:createHash('sha256').update(text).digest('hex'),start:p.value.start,end:p.value.end,snippet:text.slice(0,110)});}
  chunks.push({file:file.path,wireBytes:file.wire,rawBytes:Buffer.byteLength(code),gzipBytes:gzipSync(code).length,moduleCount:modules.length,modules:modules.sort((a,b)=>b.rawBytes-a.rawBytes)});
 }
 report.variants[variant]={root,chunks};
}
writeFileSync('evidence/performance-production/chunk-modules.json',JSON.stringify(report,null,2)+'\n');
for(const[v,d]of Object.entries(report.variants))for(const c of d.chunks)console.log(v,c.file,c.wireBytes,c.rawBytes,'modules',c.moduleCount,'largest',c.modules.slice(0,5).map(m=>[m.id,m.rawBytes,m.standaloneGzip]));
