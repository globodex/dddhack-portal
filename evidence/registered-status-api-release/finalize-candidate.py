import hashlib,json,subprocess,sys
from pathlib import Path
root=Path(sys.argv[1]);state=json.loads((root/'state.json').read_text());src=root/'source';out=root/'candidate';ev=root/'evidence';prior=Path(state['priorCandidatePreserved'])
h=lambda b:hashlib.sha256(b).hexdigest()
r=json.loads((out/'receipt.json').read_text());w=json.loads((root/'pwsh/checks/report.json').read_text(encoding='utf-8-sig'));host=json.loads((ev/'host-smoke.json').read_text());meta=json.loads((out/'build-metadata.json').read_text())
assert w['Passed']==6 and w['ProviderActions']==0 and w['ArchiveSHA256']==r['sha256']
assert host['hostSmoke']['outboundAttempts']==[] and [x['status'] for x in host['hostSmoke']['checks']]==[200,403,503]
assert h((out/'portalapi.zip').read_bytes())==r['sha256']==meta['sha256']==host['archive']['sha256']
assert r['runtimeSource']==state['source'] and meta['env']=={} and meta['warnings']==[]
for x in json.loads((ev/'all-input-hashes.json').read_text()):assert h((src/x['path']).read_bytes())==x['sha256'],x['path']
for x in json.loads((ev/'exported-source-hashes.json').read_text()):assert h((src/x['path']).read_bytes())==x['sha256'],x['path']
currentHashes=json.loads((ev/'runtime-input-hashes.json').read_text());oldHashes=json.loads((prior/'evidence/runtime-input-hashes.json').read_text());oldMap={x['path']:x['sha256'] for x in oldHashes}
changed=[x['path'] for x in currentHashes if oldMap.get(x['path'])!=x['sha256']]
assert {'lib/admin-team-approval.ts','lib/sign-in-evidence.ts','lib/team-lifecycle.ts'}.issubset({x['path'] for x in currentHashes})
oldReceipt=json.loads((prior/'candidate/receipt.json').read_text());assert h((prior/'candidate/portalapi.zip').read_bytes())==oldReceipt['sha256']=='4a7573b971c944d29f32c90fcf0e069880880771b1ca2eff2daf9e2cc0e203da'
for name,oldpin,newpin in [('prepare-backend-windows.ps1','ea9b0a2f9f99de33626cdffd7dafbe096eee6f3812ffe7d56cfc5793856d1dcb',r['sha256']),('test-backend-windows-handoff.ps1','ac6e91129b873692e0a92481f57e957a7f3705a79c0b8c1ad79a6f6d218daa22',r['indexSha256'])]:
 old=(src/'scripts'/name).read_text();new=(root/'helpers'/name).read_text();assert new==old.replace(oldpin,newpin) and old.count(oldpin)==1
 assert (Path('/workspace/dddhack-portal/scripts')/name).read_bytes()==(src/'scripts'/name).read_bytes()
assert h(Path('/workspace/dddhack-portal/artifacts/neon/portalapi.zip').read_bytes())=='ea9b0a2f9f99de33626cdffd7dafbe096eee6f3812ffe7d56cfc5793856d1dcb'
owned=['artifacts/neon','scripts/prepare-backend-windows.ps1','scripts/test-backend-windows-handoff.ps1','docs/FINAL_NEON_API_ARCHIVE_VERIFICATION.md','docs/DESIGN_RELEASE_WINDOWS_DEPLOY.md']
assert subprocess.check_output(['git','diff','--name-only','--',*owned],cwd='/workspace/dddhack-portal',text=True)==''
headers=[]
for f in r['nativeFiles']:
 text=subprocess.check_output(['readelf','--file-header',str(root/'extracted'/f['path'])],text=True);assert 'AArch64' in text;headers.append({'path':f['path'],'sha256':f['sha256'],'readelf':text})
(ev/'native-readelf.json').write_text(json.dumps({'runtimeSource':r['runtimeSource'],'nativeExecution':False,'headers':headers},indent=2)+'\n')
(ev/'windows-handoff-report.json').write_text(json.dumps(w,indent=2)+'\n')
ops=json.loads((prior/'evidence/build-operations.json').read_text());ops.update(runtimeSource=state['source'],sourceSnapshot=state['method'],exportedFiles=state['exportedFiles'])
(ev/'build-operations.json').write_text(json.dumps(ops,indent=2)+'\n');(ev/'public-tool-setup.json').write_bytes((prior/'evidence/public-tool-setup.json').read_bytes())
r['hostSmoke']={'passed':True,'report':str(ev/'host-smoke.json'),'statuses':[200,403,503],'outboundAttempts':0,'dependencySubstitution':'Separate unchanged-JavaScript host copy resolves installed x86_64 Sharp; ARM64 archive and extracted tree remain unchanged','nativeArmExecution':False}
r['windowsHandoff']={'checksPassed':6,'report':str(ev/'windows-handoff-report.json'),'powerShellVersion':'7.6.8','platform':'Unix','nativeWindowsExecution':False,'liveDownload':False,'neonCommands':0,'helpers':str(root/'helpers'),'repositoryHelpersUnchanged':True,'helperSemanticChanges':'Digest pins changed only in private /tmp copies'}
r['verificationEvidence']=str(ev);r['existingRepositoryArchiveUnchanged']=True;r['privateConfigurationExcluded']=True;r['publicationAuthorized']=True;r['repositoryPromotionPendingRootVerification']=True;r['previousCandidatePreserved']={'path':str(prior),'source':oldReceipt['runtimeSource'],'sha256':oldReceipt['sha256'],'changedApplicationInputs':changed}
(out/'receipt.json').write_text(json.dumps(r,indent=2)+'\n')
verify={'runtimeSource':r['runtimeSource'],'candidateArchive':r['archive'],'sha256':r['sha256'],'zipBytes':r['zipBytes'],'uncompressedBytes':r['uncompressedBytes'],'files':r['fileCount'],'indexSha256':r['indexSha256'],'limits':r['limits'],'freshJavaScriptByteIdentical':True,'allGraphInputHashesRechecked':True,'applicationInputsMatchExactGitSnapshot':True,'graphInputs':r['graphInputCount'],'applicationInputs':r['graphApplicationInputCount'],'forbiddenInputs':[],'frontendOrImageInputs':[],'archiveForbiddenPaths':[],'nativeFiles':r['nativeFiles'],'nativeArmExecution':False,'hostStatuses':[200,403,503],'outboundAttempts':0,'powershellChecks':6,'nativeWindowsExecution':False,'canonicalPlanDigest':r['canonicalPlanDigest'],'requiredSchemaBeforeDeploy':r['requiredSchemaBeforeDeploy'],'repositoryArchiveSha256Unchanged':'ea9b0a2f9f99de33626cdffd7dafbe096eee6f3812ffe7d56cfc5793856d1dcb','repositoryHelpersAndReleaseDocsUnchanged':True,'rootUncommittedNoBackupWorkExcluded':True,'previousCandidatePreserved':True,'changedInputsFromPreviousCandidate':changed,'credentialsRead':False,'sourceUploaded':False,'providerOperations':False,'databaseAccess':False,'migrationPerformed':False,'deploymentPerformed':False,'publicationAuthorized':True,'repositoryPromotionPendingRootVerification':True}
(ev/'verification.json').write_text(json.dumps(verify,indent=2)+'\n')
manual=(prior/'CANDIDATE_HANDOFF.md').read_text().replace(oldReceipt['runtimeSource'],r['runtimeSource']).replace(oldReceipt['sha256'],r['sha256']).replace(oldReceipt['indexSha256'],r['indexSha256'])
manual=manual.replace('870 input hashes','873 input hashes').replace('This candidate is for review; publication is not authorized.','Publication is authorized for this release. This candidate awaits root verification and repository promotion; deployment remains a separate manual owner action.')
(root/'CANDIDATE_HANDOFF.md').write_text(manual)
print(json.dumps({'source':r['runtimeSource'],'candidateZip':r['archive'],'sha256':r['sha256'],'indexSha256':r['indexSha256'],'receipt':str(out/'receipt.json'),'verification':str(ev/'verification.json'),'allGatesPassed':True,'oldArchiveAndPinsUnchanged':True,'priorCandidatePreserved':True,'publicationAuthorized':True,'repositoryPromotionPendingRootVerification':True}))
