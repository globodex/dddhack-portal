import {githubEligibility} from '../../lib/evaluation';
type Metadata={public:boolean;createdAt:string;firstCommit:string|null};
export type RepositoryTiming={state:'eligible'|'ineligible'|'pending';metadata?:Metadata;commitSha?:string;reason:string};
const pending=():RepositoryTiming=>({state:'pending',reason:'Repository timing could not yet be verified. Retry or organizer review is needed.'});
const date=(v:unknown)=>typeof v==='string'&&Number.isFinite(Date.parse(v))?new Date(v).toISOString():null;
const sha=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{40}$/i.test(v);
export function repositoryApiBase(repository:string){try{const parsed=new URL(repository),parts=parsed.pathname.replace(/\/+$/,'').split('/').filter(Boolean);if(parsed.protocol!=='https:'||!['github.com','www.github.com'].includes(parsed.hostname)||parsed.port||parsed.username||parsed.password||parts.length!==2)return null;const owner=parts[0],repo=parts[1].replace(/\.git$/i,'');if(!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(owner)||!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(repo))return null;return `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`}catch{return null}}
export async function readRepositoryJson(fetcher:typeof fetch,url:string,signal:AbortSignal,maxBytes=65_536){
 const endpoint=new URL(url);if(endpoint.protocol!=='https:'||endpoint.hostname!=='api.github.com'||endpoint.username||endpoint.password||endpoint.port)throw new Error('UNAVAILABLE');
   const response=await fetcher(url,{signal:signal,redirect:'error',cache:'no-store',headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2026-03-10'}});if(!response.ok||Number(response.headers.get('content-length'))>maxBytes)throw new Error('UNAVAILABLE');
   const reader=response.body?.getReader();if(!reader)throw new Error('UNAVAILABLE');let bytes=0,body='';const decoder=new TextDecoder();try{for(;;){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>maxBytes)throw new Error('LIMIT');body+=decoder.decode(value,{stream:true});}body+=decoder.decode();}finally{await reader.cancel().catch(()=>{});reader.releaseLock()}
   return {value:JSON.parse(body) as any,link:response.headers.get('link')||''};
}
/** Fixed-host, bounded public metadata reads only. No credentials, code, demographic data or model calls. */
export async function collectRepositoryTiming(repository:string,fetcher:typeof fetch):Promise<RepositoryTiming>{
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10_000);
 try{
  const base=repositoryApiBase(repository);if(!base)return pending();
  const read=(url:string)=>readRepositoryJson(fetcher,url,controller.signal);
  const repoResponse=await read(base),createdAt=date(repoResponse.value.created_at);if(repoResponse.value.private!==false||!createdAt)return pending();
  const metadata:Metadata={public:true,createdAt,firstCommit:null};
  if(githubEligibility(metadata)==='INELIGIBLE')return {state:'ineligible',metadata,reason:'Your GitHub repository was created before 1 November 2026, 08:00 IST.'};
  const latest=await read(base+'/commits?per_page=1');if(!Array.isArray(latest.value)||latest.value.length!==1||!sha(latest.value[0]?.sha))return pending();const commitSha=latest.value[0].sha.toLowerCase();
  // Pagination is pinned to the observed head SHA, so new branch commits cannot shift the history underneath us.
  const historyUrl=base+`/commits?sha=${commitSha}&per_page=1`,history=await read(historyUrl);let oldest=history.value;
  if(history.link){if(history.link.length>4096)return pending();const last=history.link.match(/<([^>]+)>;\s*rel="last"/);if(!last)return pending();const link=new URL(last[1]),page=link.searchParams.get('page');if(link.protocol!=='https:'||link.hostname!=='api.github.com'||link.username||link.password||!page||!/^\d{1,7}$/.test(page)||Number(page)<1)return pending();oldest=(await read(historyUrl+'&page='+Number(page))).value;}
  if(!Array.isArray(oldest)||oldest.length!==1||!sha(oldest[0]?.sha))return pending();const commitDates=[date(oldest[0]?.commit?.committer?.date),date(oldest[0]?.commit?.author?.date)].filter((value):value is string=>value!==null).sort();metadata.firstCommit=commitDates[0]||null;if(!metadata.firstCommit)return pending();
  const eligibility=githubEligibility(metadata);return {state:eligibility==='ELIGIBLE'?'eligible':eligibility==='INELIGIBLE'?'ineligible':'pending',metadata,commitSha,reason:eligibility==='INELIGIBLE'?'Your repository’s first commit predates 1 November 2026, 08:00 IST.':'Repository timing checked against 1 November 2026, 08:00 IST. Dates are operational evidence, not proof of original authorship.'};
 }catch{return pending()}finally{clearTimeout(timer)}
}
