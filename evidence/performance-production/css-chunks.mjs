import postcss from 'postcss';import cssnano from 'next/dist/compiled/cssnano-simple/index.js';import{readFileSync,readdirSync,writeFileSync}from'node:fs';import{gzipSync}from'node:zlib';
const roots={baseline:'/workspace/ddd-perf-prod-baseline',final:'/workspace/ddd-perf-prod-final'},report={method:'Match existing compiled CSS rule selector/context/declaration signatures to individually minified source sheets, using the installed Next cssnano settings. Raw matched rule bytes identify source ownership; gzip is only exact at whole-chunk level and is not additive per source. Unmatched/ambiguous bytes are explicit.',variants:{}};
function context(n){const a=[];for(let p=n.parent;p&&p.type!=='root';p=p.parent)if(p.type==='atrule')a.unshift('@'+p.name+' '+p.params);return a.join('|');}
function declarations(n){return(n.nodes||[]).filter(x=>x.type==='decl'&&!x.prop.startsWith('-')).map(x=>x.prop+':'+x.value.replace(/\s+/g,' ').replace(/^1 0$/,'1 1 0')+(x.important?'!important':'')).join(';');}
function key(n){return context(n)+'|'+n.selector+'|'+declarations(n);}
for(const[v,root]of Object.entries(roots)){
 const sourceIndex=new Map(),sourceSizes={};
 for(const name of readdirSync(root+'/app').filter(x=>x.endsWith('.css'))){
  const src=readFileSync(root+'/app/'+name,'utf8');const result=await postcss([cssnano({colormin:false},postcss)]).process(src,{from:name,map:false});sourceSizes[name]={rawBytes:Buffer.byteLength(src),minifiedBytes:Buffer.byteLength(result.css),standaloneGzip:gzipSync(result.css).length};
  postcss.parse(result.css).walkRules(n=>{const k=key(n);if(!sourceIndex.has(k))sourceIndex.set(k,new Set());sourceIndex.get(k).add(name);});
 }
 const rd=JSON.parse(readFileSync('evidence/performance-production/report.json','utf8')),row=rd.samples.find(s=>s.variant===v&&s.label==='dashboard'&&s.phase==='cold'),chunks=[];
 for(const req of row.requests.filter(r=>r.type==='Stylesheet')){
  const file=new URL(req.url).pathname.replace('/_next/',''),src=readFileSync(root+'/.next/'+file,'utf8'),css=postcss.parse(src),bySource={},ambiguous={},unmatched=[];let ruleBytes=0;
  css.walkRules(n=>{let nested=false;n.walkRules(()=>nested=true);if(nested)return;const bytes=Buffer.byteLength(src.slice(n.source.start.offset,n.source.end.offset));ruleBytes+=bytes;const sources=[...(sourceIndex.get(key(n))||[])];if(sources.length===1)bySource[sources[0]]=(bySource[sources[0]]||0)+bytes;else if(sources.length>1){const k=sources.join(' | ');ambiguous[k]=(ambiguous[k]||0)+bytes;}else unmatched.push({selector:n.selector,context:context(n),bytes});});
  const names=Object.keys(bySource);chunks.push({file,wireBytes:req.encodedDataLength,rawBytes:Buffer.byteLength(src),gzipBytes:gzipSync(src).length,sourceMatchedRuleBytes:bySource,ambiguousRuleBytes:ambiguous,unmatchedRuleBytes:unmatched.reduce((s,x)=>s+x.bytes,0),wrapperFontfaceOrOtherBytes:Buffer.byteLength(src)-ruleBytes,unmatchedLargest:unmatched.sort((a,b)=>b.bytes-a.bytes).slice(0,8)});
 }
 report.variants[v]={chunks,sourceSizes};
}
writeFileSync('evidence/performance-production/css-chunks.json',JSON.stringify(report,null,2)+'\n');
for(const[v,d]of Object.entries(report.variants))for(const c of d.chunks)console.log(v,c.file,c.wireBytes,'sources',c.sourceMatchedRuleBytes,'unmatched',c.unmatchedRuleBytes,'wrappers',c.wrapperFontfaceOrOtherBytes);
