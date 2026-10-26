import hashlib,json,pathlib,stat,struct,sys,zipfile
archive,prior,dest=sys.argv[1:]
with zipfile.ZipFile(archive) as z,zipfile.ZipFile(prior) as old:
    files=[f for f in z.infolist() if not f.is_dir()]
    assert len(files)<=4096 and sum(f.file_size for f in files)<=67108864
    assert len({f.filename for f in files})==len(files)
    forbidden=[];native=[];changed=[];unchanged=[];hashes=[]
    for f in files:
        p=pathlib.PurePosixPath(f.filename)
        assert not p.is_absolute() and '..' not in p.parts and ':' not in f.filename and '\\' not in f.filename
        assert not stat.S_ISLNK(f.external_attr>>16) and not f.flag_bits&1
        if any(x in ('tests','test','fixtures','local-test','.git','.local','.neon') or x.startswith('.env') for x in p.parts) or p.suffix.lower() in ('.sql','.png','.jpg','.jpeg','.svg','.gif','.webp','.avif','.ico','.css','.scss'):
            forbidden.append(f.filename)
        data=z.read(f);sha=hashlib.sha256(data).hexdigest()
        hashes.append(dict(path=f.filename,sha256=sha,bytes=len(data)))
        if data[:4]==b'\x7fELF':native.append(dict(path=f.filename,bytes=len(data),compressedBytes=f.compress_size,sha256=sha,elfMachine=struct.unpack('<H',data[18:20])[0]))
        if f.filename in old.namelist() and old.read(f.filename)==data:unchanged.append(f.filename)
        else:changed.append(dict(path=f.filename,sha256=sha,bytes=len(data)))
    assert not forbidden
    assert len(native)==2 and all(n['elfMachine']==183 for n in native)
    z.extractall(dest)
    print(json.dumps(dict(fileCount=len(files),uncompressedBytes=sum(f.file_size for f in files),nativeFiles=native,forbiddenPaths=forbidden,changedEntries=changed,unchangedEntries=unchanged,priorEntriesRemoved=sorted(set(old.namelist())-set(z.namelist())),allArchiveInputHashes=hashes)))
