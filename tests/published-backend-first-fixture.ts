import ts from 'typescript';
import {execFileSync} from 'node:child_process';
import {mkdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {pathToFileURL} from 'node:url';
export const publishedClientCommit='0ab8d31bbfd5d3770f41d3a490fa22b615e91c35';
/** Exact pinned repository source, never a live service. Dependencies resolve from this checkout. */
export async function publishedContractFixture(){
 const parent=resolve('.local');mkdirSync(parent,{recursive:true,mode:0o700});const root=mkdtempSync(join(parent,'published-client-'));
 const paths=execFileSync('git',['ls-tree','-r','--name-only',publishedClientCommit,'app','lib','neon','scripts','db','package.json','tsconfig.json'],{encoding:'utf8'}).trim().split('\n');
 for(const path of paths){const target=join(root,path);mkdirSync(dirname(target),{recursive:true});const source=execFileSync('git',['show',publishedClientCommit+':'+path],{maxBuffer:16*1024*1024});writeFileSync(target,path.endsWith('.tsx')?ts.transpileModule(source.toString('utf8'),{fileName:path,compilerOptions:{target:ts.ScriptTarget.ES2023,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText:source);}
 try{const [portal,http,service]=await Promise.all([import(pathToFileURL(join(root,'app/portal.tsx')).href),import(pathToFileURL(join(root,'lib/http.ts')).href),import(pathToFileURL(join(root,'lib/service.ts')).href)]);return {portal,http,service,root,close:()=>rmSync(root,{recursive:true,force:true})}}catch(error){rmSync(root,{recursive:true,force:true});throw error}
}
