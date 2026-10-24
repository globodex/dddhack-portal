"""Read-only logical fingerprint of the preserved synthetic fixture. No migration/seed/checkpoint."""
from pathlib import Path
from hashlib import sha256
import json,sqlite3,sys
source=Path('/tmp/ddd-redesign-rich.sqlite')
connection=sqlite3.connect('file:'+str(source)+'?mode=ro',uri=True)
connection.execute('PRAGMA query_only=1')
rows=connection.execute("SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").fetchall()
def encode(value):
 return {'bytes':value.hex()} if isinstance(value,bytes) else value
inventory=[]
for name,sql in rows:
 quoted='"'+name.replace('"','""')+'"'
 serialized=sorted(json.dumps([encode(v) for v in row],ensure_ascii=False,separators=(',',':')) for row in connection.execute('SELECT * FROM '+quoted))
 inventory.append({'table':name,'rows':len(serialized),'schemaSha256':sha256((sql or '').encode()).hexdigest(),'contentSha256':sha256(('\n'.join(serialized)).encode()).hexdigest()})
connection.close()
payload={'database':str(source),'mode':'SQLite mode=ro + query_only; SELECT only','syntheticOnly':True,'tables':inventory,'logicalSha256':sha256(json.dumps(inventory,sort_keys=True,separators=(',',':')).encode()).hexdigest()}
out=Path(sys.argv[1]);out.write_text(json.dumps(payload,indent=2)+'\n')
print(json.dumps({'file':str(out),'tables':len(inventory),'logicalSha256':payload['logicalSha256']}))
