"""Explicit QA-only account expansion. Never used by application code."""
import argparse,sqlite3,json,datetime
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--database',required=True);p.add_argument('--output',required=True);a=p.parse_args()
db=Path(a.database).resolve();out=Path(a.output).resolve()
if db.parent!=Path('/tmp') or not db.name.startswith('ddd-viewer-') or not db.is_file():raise SystemExit('OWN_NEW_VIEWER_FIXTURE_REQUIRED')
if db.read_bytes()[:16]!=b'SQLite format 3\0':raise SystemExit('SQLITE_HEADER_REQUIRED')
if out.suffix!='.json' or out.exists() or out==db:raise SystemExit('NEW_DISTINCT_JSON_OUTPUT_REQUIRED')
con=sqlite3.connect(db);now=datetime.datetime.now(datetime.timezone.utc).isoformat()
with con:
 for n in range(1,28):
  con.execute('INSERT INTO users(id,email,name,role,created_at) VALUES(?,?,?,?,?)',(f'qa_viewer_{n:03}',f'viewer{n:03}@portal.test',f'QA Viewer {n:03}','participant',now))
result={'database':str(db),'syntheticOnly':True,'operation':'27 additional unregistered existing synthetic accounts; no application content or production data','newViewerRows':27,'existingFixtureViewer':'fake_stranger','expectedNotRegisteredViewerRows':28,'integrity':con.execute('PRAGMA integrity_check').fetchone()[0],'foreignKeyFailures':con.execute('PRAGMA foreign_key_check').fetchall()}
con.close();out.parent.mkdir(parents=True,exist_ok=True)
with out.open('x') as f:json.dump(result,f,indent=2);f.write('\n')
print(json.dumps(result))
