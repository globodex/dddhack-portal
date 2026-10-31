import {RepositoryReadError} from '../../lib/repository-read-error';
export type PublicGitHubReader={read:(url:string,signal:AbortSignal,maxBytes?:number)=>Promise<{value:any;link:string}>};
const unavailable=()=>new RepositoryReadError({code:'GITHUB_UNAVAILABLE'});
const segment='[A-Za-z0-9][A-Za-z0-9_.-]{0,99}';
function endpoint(value:string){
 let url:URL;try{url=new URL(value)}catch{throw unavailable()}
 if(url.protocol!=='https:'||url.hostname!=='api.github.com'||url.username||url.password||url.port||url.hash)throw unavailable();
 const match=url.pathname.match(new RegExp(`^(/repos/${segment}/${segment})(/(?:commits|git/(?:commits|trees|blobs)/[a-f0-9]{40}))?$`));if(!match)throw unavailable();
 const suffix=match[2]||'',params=[...url.searchParams];
 if(params.some(([key,value],i)=>params.findIndex(([k])=>k===key)!==i||!(suffix==='/commits'?key==='per_page'&&value==='1'||key==='sha'&&/^[a-f0-9]{40}$/.test(value)||key==='page'&&/^[1-9]\d{0,6}$/.test(value):suffix.startsWith('/git/trees/')&&key==='recursive'&&value==='1')))throw unavailable();
 return {url,base:'https://api.github.com'+match[1],metadata:!suffix};
}
function retryTime(response:Response,now:number){
 const raw=response.headers.get('retry-after');let retry=now+60_000;
 if(raw){const duration=/^\d{1,8}$/.test(raw)?Number(raw)*1000:NaN;const date=Date.parse(raw);if(Number.isFinite(duration))retry=Math.max(retry,now+duration);else if(Number.isFinite(date))retry=Math.max(retry,date)}
 const reset=response.headers.get('x-ratelimit-reset');if(reset&&/^\d{1,10}$/.test(reset))retry=Math.max(retry,Number(reset)*1000);
 return new Date(retry).toISOString();
}
/** Server runtime only. Fixed public-repository GET allowlist; no caller headers/method/body.
 * Metadata may be inspected to reject private repositories, but their contents are never read. */
export function createPublicGitHubReader(fetcher:typeof fetch,token?:string,now:()=>number=Date.now):PublicGitHubReader {
 const verified=new Set<string>();let requests=0;
 const invalidToken=!!token&&!/^[A-Za-z0-9_]{20,255}$/.test(token);
 const read:PublicGitHubReader['read']=async(value,signal,maxBytes=65_536)=>{
  const target=endpoint(value);
  if(invalidToken)throw new RepositoryReadError({code:'GITHUB_AUTH_UNAVAILABLE'});
  if(!target.metadata&&!verified.has(target.base))await read(target.base,signal);
  if(++requests>16)throw new RepositoryReadError({code:'GITHUB_READ_LIMIT'});
  let response:Response;
  try{response=await fetcher(target.url.href,{method:'GET',signal,redirect:'error',cache:'no-store',headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2026-03-10',...(token?{Authorization:'Bearer '+token}:{})}})}catch{throw unavailable()}
  if(response.redirected||(response.url&&response.url!==target.url.href))throw unavailable();
  if(!response.ok){await response.body?.cancel().catch(()=>{});if(response.status===429||response.status===403&&(response.headers.get('x-ratelimit-remaining')==='0'||response.headers.has('retry-after')))throw new RepositoryReadError({code:'GITHUB_RATE_LIMITED',retryAt:retryTime(response,now())});if(response.status===401||response.status===403)throw new RepositoryReadError({code:'GITHUB_AUTH_UNAVAILABLE'});throw unavailable()}
  if(Number(response.headers.get('content-length'))>maxBytes){await response.body?.cancel().catch(()=>{});throw unavailable()}
  const reader=response.body?.getReader();if(!reader)throw unavailable();let bytes=0,body='';const decoder=new TextDecoder();
  try{for(;;){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>maxBytes)throw unavailable();body+=decoder.decode(value,{stream:true})}body+=decoder.decode()}catch{throw unavailable()}finally{await reader.cancel().catch(()=>{});reader.releaseLock()}
  let json:any;try{json=JSON.parse(body)}catch{throw unavailable()}
  if(target.metadata){if(json?.private!==false)throw new RepositoryReadError({code:'GITHUB_PUBLIC_ONLY'});verified.add(target.base)}
  return {value:json,link:response.headers.get('link')||''};
 };
 return {read};
}
