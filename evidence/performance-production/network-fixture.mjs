// Local-only QA TLS transport. Backend identity is the original synthetic fixture,
// not proof of Google sign-in. Production Next application source is unchanged.
import https from 'node:https';
import http from 'node:http';
import net from 'node:net';
import {readFileSync,appendFileSync,writeFileSync} from 'node:fs';
import {timingSafeEqual} from 'node:crypto';
const tlsRoot=process.env.QA_TLS_ROOT,trace=process.env.QA_NETWORK_TRACE;
if(!tlsRoot||!trace)throw new Error('QA_TLS_ROOT_AND_TRACE_REQUIRED');
const expected=Buffer.from('local-synthetic-proxy-secret-for-nextjs');
const frontOrigins=new Set(['https://portal-perf.test:3443','https://portal-perf.test:3444']);
const tls={key:readFileSync(tlsRoot+'/leaf-key.pem'),cert:readFileSync(tlsRoot+'/leaf.pem')};
const servers=[];
writeFileSync(trace,'');
function log(row){appendFileSync(trace,JSON.stringify({time:new Date().toISOString(),...row})+'\n');}
for(const [port,targetPort,kind]of [[3443,3310,'baseline-front'],[3444,3311,'final-front'],[8842,Number(process.env.QA_API_PORT||8789),'fixture-api']]){
 const server=https.createServer(tls,(request,response)=>{
  const started=performance.now(),path=request.url||'/',method=request.method||'GET';
  const hostname=(request.headers.host||'').split(':')[0];
  const allowedHost=kind==='fixture-api'?'api.portal-perf.test':'portal-perf.test';
  function deny(code,reason){log({kind,method,path,status:code,denied:reason});response.writeHead(code,{'content-type':'application/json'});response.end(JSON.stringify({code:reason}));}
  if(hostname!==allowedHost)return deny(403,'FIXTURE_HOST_REQUIRED');
  if(!['GET','HEAD'].includes(method))return deny(405,'READ_ONLY_FIXTURE');
  if(kind==='fixture-api'){
   const supplied=Buffer.from(String(request.headers['x-portal-proxy-secret']||''));
   if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))return deny(403,'SYNTHETIC_PROXY_REQUIRED');
   if(!frontOrigins.has(String(request.headers['x-portal-forwarded-origin']||'')))return deny(403,'SYNTHETIC_ORIGIN_REQUIRED');
   if(!/^\/api\/(portal(?:\?|$)|auth\/session(?:\?|$)|health(?:\?|$)|project-image\/)/.test(path))return deny(404,'FIXTURE_PATH_NOT_ALLOWED');
  }
  const headers={...request.headers,host:`127.0.0.1:${targetPort}`};
  delete headers.connection;delete headers['x-portal-proxy-secret'];delete headers['x-portal-forwarded-origin'];
  // Frontend receives original external Host as a normal reverse proxy would.
  if(kind!=='fixture-api'){headers.host=`portal-perf.test:${port}`;headers['x-forwarded-host']=headers.host;headers['x-forwarded-proto']='https';}
  const upstream=http.request({hostname:'127.0.0.1',port:targetPort,path,method,headers},incoming=>{
   response.writeHead(incoming.statusCode||502,incoming.headers);
   let bytes=0;incoming.on('data',chunk=>bytes+=chunk.length);incoming.pipe(response);
   incoming.on('end',()=>log({kind,method,path,status:incoming.statusCode,bytes,durationMs:Number((performance.now()-started).toFixed(3)),forwardedOrigin:kind==='fixture-api'?request.headers['x-portal-forwarded-origin']:undefined}));
  });
  upstream.on('error',error=>{log({kind,method,path,status:502,error:error.code||error.message});if(!response.headersSent)response.writeHead(502);response.end('LOCAL_FIXTURE_UPSTREAM_UNAVAILABLE');});
  request.on('aborted',()=>upstream.destroy());request.pipe(upstream);
 });
 server.listen(port,'127.0.0.1',()=>console.log(`${kind} TLS fixture listening127.0.0.1:${port}`));servers.push(server);
}
// Browser HTTP CONNECT proxy: deny every external destination without disabling HTTP cache.
const proxy=http.createServer((request,response)=>{log({kind:'browser-proxy',method:request.method,path:request.url,status:403,denied:'CONNECT_ONLY'});response.writeHead(403);response.end();});
proxy.on('connect',(request,client,head)=>{
 const targets=new Map([['portal-perf.test:3443',3443],['portal-perf.test:3444',3444]]);
 const port=targets.get(request.url||'');
 if(!port){log({kind:'browser-proxy',method:'CONNECT',path:request.url,status:403,denied:'FIXTURE_DESTINATION_ONLY'});client.end('HTTP/1.1 403 Forbidden\r\n\r\n');return;}
 const upstream=net.connect(port,'127.0.0.1',()=>{client.write('HTTP/1.1 200 Connection Established\r\n\r\n');if(head.length)upstream.write(head);client.pipe(upstream);upstream.pipe(client);});
 upstream.on('error',()=>client.destroy());client.on('error',()=>upstream.destroy());
});
proxy.listen(8899,'127.0.0.1',()=>console.log('Allowlisted browser CONNECT proxy listening127.0.0.1:8899'));servers.push(proxy);
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{for(const server of servers)server.close();setTimeout(()=>process.exit(0),300).unref();});
