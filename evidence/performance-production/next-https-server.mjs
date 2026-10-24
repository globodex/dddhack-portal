// QA-only supported Next custom HTTPS server. Uses unchanged compiled artifacts.
// Based on installed Next16.4.3 docs/01-app/02-guides/custom-server.md.
import next from 'next';
import https from 'node:https';
import {readFileSync,appendFileSync,writeFileSync} from 'node:fs';
const dir=process.env.QA_NEXT_ROOT,port=Number(process.env.QA_NEXT_TLS_PORT),tlsRoot=process.env.QA_TLS_ROOT,trace=process.env.QA_FRONT_TRACE;
if(!dir||![3443,3444].includes(port)||!tlsRoot||!trace)throw new Error('EXACT_QA_NEXT_TLS_CONFIGURATION_REQUIRED');
if(process.env.NODE_ENV!=='production'||process.env.PORTAL_LOCAL_TEST!==undefined)throw new Error('PRODUCTION_MODE_WITHOUT_LOCAL_ADAPTER_REQUIRED');
if(process.env.APP_ORIGIN!==`https://portal-perf.test:${port}`||process.env.NEON_API_ORIGIN!=='https://api.portal-perf.test:8842')throw new Error('EXACT_QA_TLS_ORIGINS_REQUIRED');
const app=next({dev:false,dir,hostname:'portal-perf.test',port});
await app.prepare();const handle=app.getRequestHandler();writeFileSync(trace,'');
const server=https.createServer({key:readFileSync(tlsRoot+'/leaf-key.pem'),cert:readFileSync(tlsRoot+'/leaf.pem')},async(req,res)=>{
 const start=performance.now(),path=req.url||'/',method=req.method||'GET';let bytes=0;
 const write=res.write.bind(res),end=res.end.bind(res);
 res.write=function(chunk,...args){if(chunk)bytes+=Buffer.byteLength(chunk);return write(chunk,...args);};
 res.end=function(chunk,...args){if(chunk&&typeof chunk!=='function')bytes+=Buffer.byteLength(chunk);return end(chunk,...args);};
 res.on('finish',()=>appendFileSync(trace,JSON.stringify({time:new Date().toISOString(),method,path,status:res.statusCode,bytes,durationMs:Number((performance.now()-start).toFixed(3))})+'\n'));
 if(req.headers.host!==`portal-perf.test:${port}`){res.writeHead(403);res.end('FIXTURE_HOST_REQUIRED');return;}
 if(!['GET','HEAD'].includes(method)){res.writeHead(405);res.end('READ_ONLY_FIXTURE');return;}
 try{await handle(req,res);}catch(error){console.error(error);if(!res.headersSent)res.writeHead(500);res.end('LOCAL_NEXT_FIXTURE_FAILED');}
});
server.listen(port,'127.0.0.1',()=>console.log(`Production Next HTTPS ready https://portal-perf.test:${port}; pid${process.pid}; source${dir}`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{server.close();server.closeAllConnections();void app.close().finally(()=>process.exit(0));setTimeout(()=>process.exit(0),2000).unref();});
