import assert from 'node:assert/strict';
import { readFileSync,writeFileSync,mkdtempSync,mkdirSync,copyFileSync,symlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as esbuild from '/tmp/ddd-neon-build-tools/node_modules/esbuild/lib/main.js';
import { ESM_CJS_INTEROP_BANNER } from '/tmp/ddd-neon-build-tools/node_modules/@neon/config-runtime/dist/lib/function-bundle.js';
import { DEFAULT_ARCHIVE_LIMITS } from '/tmp/ddd-neon-build-tools/node_modules/@neon/config-runtime/dist/v1.js';

const root='/workspace/ddd-final-neon-api',source='c56904fca3966c8d8c83327f574aedc3de8c0df3';
process.chdir(root);
assert.equal(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),source);
const state=JSON.parse(readFileSync('/tmp/ddd-privacy-api-refresh-build-state.json','utf8'));
const evidence='evidence/privacy-neon-api-refresh';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const json=(path,value)=>writeFileSync(path,JSON.stringify(value,null,2)+'\n');
const extracted=mkdtempSync('/tmp/ddd-privacy-api-refresh-extracted-');
const inventory=JSON.parse(execFileSync('python3',['-c',String.raw`import zipfile,hashlib,json,sys,struct,pathlib
archive,prior,dest=sys.argv[1:]
with zipfile.ZipFile(archive) as z,zipfile.ZipFile(prior) as old:
 files=[f for f in z.infolist() if not f.is_dir()]
 assert len({f.filename for f in files})==len(files)
 forbidden=[];native=[];changed=[];unchanged=[]
 for f in files:
  p=pathlib.PurePosixPath(f.filename)
  assert not p.is_absolute() and '..' not in p.parts and ':' not in f.filename and '\\' not in f.filename
  data=z.read(f)
  if any(x in ('tests','test','fixtures','local-test','.git','.local','.neon') or x.startswith('.env') for x in p.parts): forbidden.append(f.filename)
  if data[:4]==b'\x7fELF': native.append(dict(path=f.filename,bytes=len(data),compressedBytes=f.compress_size,sha256=hashlib.sha256(data).hexdigest(),elfMachine=struct.unpack('<H',data[18:20])[0]))
  if f.filename in old.namelist() and old.read(f.filename)==data:unchanged.append(f.filename)
  else:changed.append(dict(path=f.filename,sha256=hashlib.sha256(data).hexdigest(),bytes=len(data)))
 assert not forbidden
 assert len(native)==2 and all(n['elfMachine']==183 for n in native)
 z.extractall(dest)
 print(json.dumps(dict(fileCount=len(files),uncompressedBytes=sum(f.file_size for f in files),nativeFiles=native,archiveHasSecretsOrTests=forbidden,changedEntries=changed,unchangedEntries=unchanged,priorEntriesRemoved=sorted(set(old.namelist())-set(z.namelist())))))`,resolve('artifacts/neon/portalapi.zip'),state.baseline+'/portalapi.zip',extracted],{encoding:'utf8',env:{PATH:process.env.PATH,LANG:'C.UTF-8',TZ:'UTC'}}));
assert.equal(inventory.fileCount,93);
assert.equal(inventory.changedEntries.length,1);
assert.equal(inventory.changedEntries[0].path,'index.mjs');
assert.equal(inventory.unchangedEntries.length,92);
assert.deepEqual(inventory.priorEntriesRemoved,[]);
const archive=readFileSync('artifacts/neon/portalapi.zip');
assert.ok(archive.length<=DEFAULT_ARCHIVE_LIMITS.maxZipBytes);
assert.ok(inventory.uncompressedBytes<=DEFAULT_ARCHIVE_LIMITS.maxTotalBytes);
assert.ok(inventory.fileCount<=DEFAULT_ARCHIVE_LIMITS.maxEntries);
const index=readFileSync(resolve(extracted,'index.mjs'));
assert.ok(index.includes(Buffer.from(ESM_CJS_INTEROP_BANNER)));
assert.ok(/from["']sharp["']/.test(index.toString()));
const fresh=await esbuild.build({entryPoints:[resolve('neon/api.ts')],bundle:true,write:false,outfile:'index.mjs',minify:true,format:'esm',platform:'node',banner:{js:ESM_CJS_INTEROP_BANNER},external:['sharp'],metafile:true,logLevel:'silent'});
assert.equal(fresh.outputFiles.length,1);
assert.ok(index.equals(fresh.outputFiles[0].contents),'FRESH_OFFICIAL_OPTIONS_JS_NOT_BYTE_IDENTICAL');
const inputs=Object.keys(fresh.metafile.inputs).sort();
const forbiddenInputs=inputs.filter(file=>/(^|\/)(tests?|fixtures|local-test|\.local|\.git)(\/|$)|(^|\/)\.env(?:\.|$)|(^|\/)scripts\/fixtures\./.test(file));
const frontendInputs=inputs.filter(file=>/^(app|components)\//.test(file)||/\.(css|scss)$/.test(file));
assert.deepEqual(forbiddenInputs,[]);
assert.deepEqual(frontendInputs,[]);
assert.ok(!inputs.includes('lib/seo.ts'),'UNEXPECTED_SEO_API_EDGE');
const inputHashes=inputs.map(path=>({path,sha256:hash(readFileSync(resolve(path)))}));
const applicationHashes=inputHashes.filter(input=>/^(lib|neon)\//.test(input.path));
const oldHashes=JSON.parse(readFileSync('evidence/final-neon-api-refresh/runtime-input-hashes.json','utf8'));
const oldMap=new Map(oldHashes.map(item=>[item.path,item.sha256]));
const changes=applicationHashes.filter(item=>oldMap.get(item.path)!==item.sha256).map(item=>({path:item.path,state:oldMap.has(item.path)?'changed':'added'}));
const graph={runtimeSource:source,method:'Fresh esbuild analysis using the exact official config-runtime1.10.2 options and imported interoperability banner; full JS bytes match the archive.',esbuild:esbuild.version,graphInputCount:inputs.length,graphApplicationInputCount:applicationHashes.length,forbiddenInputs,frontendInputs,seoImported:false,inputs,indexBytes:index.length,indexSha256:hash(index),inputHashesSha256:hash(Buffer.from(JSON.stringify(inputHashes))),officialOptionsMatch:true,archiveIndexBytesIdentical:true};
json(evidence+'/inventory.json',inventory);
json(evidence+'/graph.json',graph);
json(evidence+'/runtime-input-hashes.json',applicationHashes);
json(evidence+'/all-input-hashes.json',inputHashes);
json(evidence+'/archive-refresh-comparison.json',{baselineRuntimeSource:JSON.parse(readFileSync(state.baseline+'/receipt.json','utf8')).runtimeSource,baselineSha256:hash(readFileSync(state.baseline+'/portalapi.zip')),currentSource:source,currentSha256:hash(archive),changedEntries:inventory.changedEntries,unchangedEntryCount:inventory.unchangedEntries.length,applicationInputChanges:changes,removedApplicationInputs:oldHashes.filter(item=>!applicationHashes.some(current=>current.path===item.path)).map(item=>item.path),noTimestampOnlyClaim:true});
const baseline=JSON.parse(readFileSync('evidence/neon-host-archive/historical-ledger-checksums.json','utf8'));
const files=new Map([['0100_auth.sql','neon/auth-migrations/0001_auth.sql'],['0101_approved_evaluation.sql','neon/auth-migrations/0002_approved_evaluation.sql']]);
const migrations=[...baseline.historical,...baseline.pendingFeatureMigrations].map(item=>{
 const path=files.get(item.name)||'neon/migrations/'+item.name;
 const checksum=hash(readFileSync(path));assert.equal(checksum,item.checksum);return {...item,path};
});
assert.equal(migrations.length,10);
json(evidence+'/local-sql-hash-review.json',{runtimeSource:source,localFilesOnly:true,ledgerInspected:false,planDigest:hash(Buffer.from(JSON.stringify(migrations.map(({name,checksum})=>({name,checksum}))))),migrations});
const metadata=JSON.parse(readFileSync('artifacts/neon/build-metadata.json','utf8'));
assert.equal(metadata.runtimeSource,source);
assert.equal(metadata.sha256,hash(archive));
assert.deepEqual(metadata.env,{});
assert.deepEqual(metadata.warnings,[]);
const receipt={...metadata,uncompressedBytes:inventory.uncompressedBytes,fileCount:inventory.fileCount,nativeArchitecture:'Linux ARM64 glibc',nativeFiles:inventory.nativeFiles,archiveHasSecretsOrTests:inventory.archiveHasSecretsOrTests,bannerPresent:true,externalSharpImport:true,indexSha256:hash(index),archive:'artifacts/neon/portalapi.zip',graphInputCount:inputs.length,graphApplicationInputCount:applicationHashes.length,forbiddenInputs,graphFrontendInputs:frontendInputs,graphRecomputed:true,graphEvidence:evidence+'/graph.json',runtimeInputHashes:evidence+'/runtime-input-hashes.json',allInputHashes:evidence+'/all-input-hashes.json',limits:DEFAULT_ARCHIVE_LIMITS,manualBackendRedeployRequired:true,manualMigrationPlan:baseline.pendingFeatureMigrations.map(({name,checksum})=>({name,sha256:checksum})),canonicalPlanDigest:hash(Buffer.from(JSON.stringify(migrations.map(({name,checksum})=>({name,checksum}))))),historicalMigrationsPreserved:baseline.historical,hostedMigrationLedgerInspected:false,manualMigrationMode:'Owner-operated pending-only upgrade. Existing nine-ledger target applies only0104 after verified backup/restore checkpoint and fresh inspect. Seven historical LF or precisely recognized whole-seven CRLF histories remain supported; no historical ledger rewrite. No migration performed by this archive build.',previousArchiveSha256:hash(readFileSync(state.baseline+'/portalapi.zip')),changedArchiveEntries:inventory.changedEntries.map(item=>item.path),unchangedArchiveEntryCount:inventory.unchangedEntries.length,archiveComparisonEvidence:evidence+'/archive-refresh-comparison.json',sourceBuildVerifiedAgainst:source};
json('artifacts/neon/receipt.json',receipt);
const host=mkdtempSync('/tmp/ddd-privacy-api-refresh-host-');
copyFileSync(resolve(extracted,'index.mjs'),host+'/index.mjs');
symlinkSync('/workspace/dddhack-portal/node_modules',host+'/node_modules','dir');
json('/tmp/ddd-privacy-api-refresh-verify-state.json',{root,source,baseline:state.baseline,extracted,host,evidence});
console.log(JSON.stringify({runtimeSource:source,archiveSha256:receipt.sha256,zipBytes:archive.length,indexSha256:hash(index),fileCount:inventory.fileCount,uncompressedBytes:inventory.uncompressedBytes,graphInputCount:inputs.length,applicationInputs:applicationHashes.length,forbiddenInputs,frontendInputs,seoImported:false,nativeFiles:inventory.nativeFiles.map(({path,elfMachine})=>({path,elfMachine})),freshJavaScriptByteIdentical:true,canonicalPlanDigest:receipt.canonicalPlanDigest,extracted,host}));
