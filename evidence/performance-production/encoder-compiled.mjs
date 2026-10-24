import {parse} from 'acorn';import {readFileSync,writeFileSync}from'node:fs';import{gzipSync}from'node:zlib';
const root='/workspace/ddd-perf-prod-final',file=root+'/.next/static/chunks/46-25dc4d392de3b32b.js',code=readFileSync(file,'utf8'),ast=parse(code,{ecmaVersion:'latest'});
const all=[];function walk(n){if(!n||typeof n!=='object')return;if(['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression','ClassDeclaration','ClassExpression','VariableDeclarator'].includes(n.type))all.push(n);for(const[k,v]of Object.entries(n)){if(k==='start'||k==='end')continue;if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')walk(v);}}walk(ast);
const selections=[];
for(const[marker,types,label]of [
 ['Your browser could not prepare the image. Try another browser.',['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression'],'prepareProjectImage'],
 ['INVALID_RASTER_IMAGE',['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression'],'inspectProjectImageBytes'],
 ['ProjectImageValidationError',['ClassDeclaration','ClassExpression'],'ProjectImageValidationError'],
 ['sourceMaxBytes:1e6',['VariableDeclarator'],'projectMediaPolicy'],
 ['function az',['FunctionDeclaration'],'headerDemand'],
 ['aT=[.86,.8,.76]',['VariableDeclarator'],'JPEGqualities']
]){
 const offset=code.indexOf(marker);const n=all.filter(n=>types.includes(n.type)&&n.start<=offset&&offset<n.end).sort((a,b)=>(a.end-a.start)-(b.end-b.start))[0];
 if(n){const text=code.slice(n.start,n.end);selections.push({label,type:n.type,start:n.start,end:n.end,rawBytes:Buffer.byteLength(text),standaloneGzip:gzipSync(text).length,snippet:text.slice(0,100)});}else selections.push({label,markerFound:offset>=0});
}
const selected=selections.filter(x=>x.start!==undefined).filter(x=>!selections.some(y=>y!==x&&y.start<=x.start&&y.end>=x.end));let modified=code;for(const n of [...selected].sort((a,b)=>b.start-a.start))modified=modified.slice(0,n.start)+modified.slice(n.end);
const report={file,selections,nonOverlappingRanges:selected.map(x=>x.label),combinedRawBytes:selected.reduce((n,x)=>n+x.rawBytes,0),fullChunkGzip:gzipSync(code).length,estimatedMarginalGzip:gzipSync(code).length-gzipSync(modified).length,limitation:'Selected exact minified function/class/policy ranges from compiled chunk. Removal/recompression is only a marginal compression estimate, not a valid rebuilt chunk or timing claim. Blob/canvas helper closures and shared policy dependencies require ownership check.'};
writeFileSync('evidence/performance-production/encoder-compiled.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
