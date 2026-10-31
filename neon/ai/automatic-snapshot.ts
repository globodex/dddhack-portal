import {createPublicGitHubReader,type PublicGitHubReader} from './github-public';
import {createHash} from 'node:crypto';
import {repositoryApiBase} from './repository-timing';
import {safeSourcePath,assertSafeEvaluationText,digest,evaluationLimits} from './input';
import {prepareApprovedSnapshot} from './repository';
const sha=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{40}$/.test(value);
/** Server-owned selection from a public, immutable commit. Never accepts client-provided source contents. */
export async function collectAutomaticSnapshot(input:{versionId:string;commitSha:string;repository:string;payload:Record<string,unknown>},fetcher:typeof fetch,reader:PublicGitHubReader=createPublicGitHubReader(fetcher)){
 const base=repositoryApiBase(input.repository);if(!base||!sha(input.commitSha))throw new Error('REPOSITORY_UNAVAILABLE');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10_000);
 try{
  const read=(url:string,max=65_536)=>reader.read(url,controller.signal,max);
  const commit=(await read(base+'/git/commits/'+input.commitSha)).value;
  if(commit.sha!==input.commitSha||!sha(commit.tree?.sha))throw new Error('REPOSITORY_BINDING_UNAVAILABLE');
  const tree=(await read(base+'/git/trees/'+commit.tree.sha+'?recursive=1',524_288)).value;
  if(tree.sha!==commit.tree.sha||tree.truncated!==false||!Array.isArray(tree.tree)||tree.tree.length>5000)throw new Error('REPOSITORY_TREE_UNAVAILABLE');
  const descriptions={projectName:input.payload.projectName,problemSolution:input.payload.problemSolution,description:input.payload.description};
  for(const value of Object.values(descriptions)){if(typeof value!=='string')throw new Error('DESCRIPTION_UNAVAILABLE');assertSafeEvaluationText(value)}
  const priority=(path:string)=>/^readme\.(md|txt)$/i.test(path)?0:path==='package.json'?1:/^(src|app|lib)\//.test(path)?2:3;
  const candidates=tree.tree.filter((item:any)=>item.type==='blob'&&typeof item.path==='string'&&safeSourcePath(item.path)&&sha(item.sha)&&Number.isSafeInteger(item.size)&&item.size>0&&item.size<=evaluationLimits.fileBytes).sort((a:any,b:any)=>priority(a.path)-priority(b.path)||a.path.localeCompare(b.path));
  const files:{path:string;content:string;commitSha:string;sha256:string}[]=[],selected=new Set<string>();let total=0;
  for(const item of candidates){if(files.length>=6)break;if(selected.has(item.path.toLowerCase())||total+item.size>evaluationLimits.totalFileBytes)continue;
   const blob=(await read(base+'/git/blobs/'+item.sha,65_536)).value;if(blob.sha!==item.sha||blob.encoding!=='base64'||typeof blob.content!=='string'||!/^[A-Za-z0-9+/=\r\n]+$/.test(blob.content))throw new Error('REPOSITORY_FILE_UNAVAILABLE');
   const bytes=Buffer.from(blob.content.replace(/[\r\n]/g,''),'base64');if(bytes.length!==item.size||createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`),bytes])).digest('hex')!==item.sha)throw new Error('REPOSITORY_FILE_MISMATCH');
   const content=bytes.toString('utf8');if(!Buffer.from(content).equals(bytes))continue;try{assertSafeEvaluationText(content)}catch{continue}
   const next={path:item.path,content,commitSha:input.commitSha,sha256:digest(content)};
   const preview={versionId:input.versionId,commitSha:input.commitSha,approved:true,approvedPaths:[...files.map(file=>file.path),next.path],descriptions,files:[...files,next],commit:{sha:input.commitSha}};
   if(Buffer.byteLength(JSON.stringify(preview))>evaluationLimits.requestBytes)continue;
   files.push(next);selected.add(item.path.toLowerCase());total+=bytes.length;
  }
  if(!files.length)throw new Error('SAFE_SOURCE_UNAVAILABLE');
  return prepareApprovedSnapshot({versionId:input.versionId,commitSha:input.commitSha,approved:true,approvedPaths:files.map(file=>file.path),descriptions,files,commit:{sha:input.commitSha}},input);
 }finally{clearTimeout(timer)}
}
