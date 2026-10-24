"""Explicit named input/output fingerprint; refuses overwrites before reading input."""
import argparse,json,sqlite3
from pathlib import Path
from hashlib import sha256
from urllib.parse import quote
p=argparse.ArgumentParser();p.add_argument('--source',required=True,type=Path);p.add_argument('--output',required=True,type=Path);a=p.parse_args()
source=a.source.resolve();out=a.output.resolve()
if source==out or out.suffix!='.json' or out.exists():raise SystemExit('REFUSED: output must be a NEW .json file distinct from source')
if source.suffix!='.sqlite':raise SystemExit('REFUSED: explicit .sqlite source required')
with source.open('rb') as f:
 if f.read(16)!=b'SQLite format 3\0':raise SystemExit('REFUSED: source is not SQLite')
c=sqlite3.connect('file:'+quote(str(source))+'?mode=ro',uri=True);c.execute('PRAGMA query_only=ON')
rows=c.execute("SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").fetchall()
def enc(v):return {'bytes':v.hex()} if isinstance(v,bytes) else v
inventory=[]
for name,sql in rows:
 quoted='"'+name.replace('"','""')+'"'
 serialized=sorted(json.dumps([enc(v) for v in row],ensure_ascii=False,separators=(',',':')) for row in c.execute('SELECT * FROM '+quoted))
 inventory.append({'table':name,'rows':len(serialized),'schemaSha256':sha256((sql or '').encode()).hexdigest(),'contentSha256':sha256(('\n'.join(serialized)).encode()).hexdigest()})
checks={'integrity':c.execute('PRAGMA integrity_check').fetchall(),'foreignKeys':c.execute('PRAGMA foreign_key_check').fetchall()};c.close()
payload={'database':str(source),'mode':'SQLite mode=ro + query_only; SELECT and read-only integrity checks only','syntheticOnly':True,'tables':inventory,'checks':checks,'logicalSha256':sha256(json.dumps(inventory,sort_keys=True,separators=(',',':')).encode()).hexdigest()}
with out.open('x') as f:f.write(json.dumps(payload,indent=2)+'\n')
print(json.dumps({'output':str(out),'tables':len(inventory),'logicalSha256':payload['logicalSha256'],'checks':checks}))
