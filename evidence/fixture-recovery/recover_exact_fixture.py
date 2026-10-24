"""Recover only a NEW local synthetic scratch DB, accepting exact manifest hashes.

Every source SQLite connection uses mode=ro/query_only. No hosted connection,
application startup, migration, seed, or replacement of the damaged path.
"""
from pathlib import Path
from hashlib import sha256
import itertools
import json
import sqlite3

HERE = Path(__file__).resolve().parent
MANIFEST = Path('/workspace/dddhack-portal/evidence/performance-production/fixture-incident/overwritten-manifest.json')
DAMAGED = Path('/tmp/ddd-redesign-rich.sqlite')
BASE = Path('/tmp/ddd-projects-controls.sqlite')
OUTPUT = Path('/tmp/ddd-redesign-rich-recovered-exact.sqlite')
EXPECTED_MANIFEST_SHA = 'd13479df286671a8f57c1bf5f4d7d58d6fd96f3a300ae61d661be3360ff38101'

def digest(value):
    return sha256(value).hexdigest()

def encode(value):
    return {'bytes': value.hex()} if isinstance(value, bytes) else value

def serialize(row):
    return json.dumps([encode(v) for v in row], ensure_ascii=False, separators=(',', ':'))

def content(rows):
    return digest('\n'.join(sorted(serialize(r) for r in rows)).encode())

def quote(name):
    return '"' + name.replace('"', '""') + '"'

def read_only(path):
    connection = sqlite3.connect('file:' + str(path) + '?mode=ro', uri=True)
    connection.execute('PRAGMA query_only=1')
    return connection

def inventory(connection):
    return [
        {'table': name, 'rows': len(data), 'schemaSha256': digest((sql or '').encode()), 'contentSha256': content(data)}
        for name, sql in connection.execute("SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
        for data in [connection.execute('SELECT * FROM ' + quote(name)).fetchall()]
    ]

if OUTPUT.exists() or Path(str(OUTPUT) + '-wal').exists() or Path(str(OUTPUT) + '-shm').exists():
    raise SystemExit('REFUSED: recovered output or sidecar already exists')
manifest_bytes = MANIFEST.read_bytes()
assert digest(manifest_bytes) == EXPECTED_MANIFEST_SHA
assert digest(DAMAGED.read_bytes()) == EXPECTED_MANIFEST_SHA
expected_document = json.loads(manifest_bytes)
expected = {row['table']: row for row in expected_document['tables']}
assert len(expected) == 64
source_rows = {}
source_sql = {}
source_rowids = {}
source_hashes = {}
paths = [BASE] + [p for p in sorted(Path('/tmp').glob('ddd*.sqlite')) if p != BASE and p != OUTPUT]
for path in paths:
    if path.read_bytes()[:16] != b'SQLite format 3\x00':
        continue
    connection = read_only(path)
    try:
        source_rows[str(path)], source_sql[str(path)], source_rowids[str(path)] = {}, {}, {}
        for name, sql in connection.execute("SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"):
            if name not in expected or digest((sql or '').encode()) != expected[name]['schemaSha256']:
                continue
            data = connection.execute('SELECT * FROM ' + quote(name)).fetchall()
            source_rows[str(path)][name] = data
            source_sql[str(path)][name] = sql
            columns = [r[1] for r in connection.execute('PRAGMA table_info(' + quote(name) + ')')]
            if 'rowid' not in columns:
                source_rowids[str(path)][name] = {serialize(row[1:]): row[0] for row in connection.execute('SELECT rowid,* FROM ' + quote(name))}
        source_hashes[str(path)] = digest(path.read_bytes())
    finally:
        connection.close()

recovered, provenance, rowids = {}, {}, {}
for name, wanted in expected.items():
    for path, tables in source_rows.items():
        data = tables.get(name)
        if data is not None and len(data) == wanted['rows'] and content(data) == wanted['contentSha256']:
            recovered[name] = data
            provenance[name] = {'method': 'whole matching table', 'source': path}
            rowids[name] = source_rowids[path].get(name, {})
            break

assert 'audit_logs' not in recovered and expected['audit_logs']['rows'] == 1
for path, tables in source_rows.items():
    for row in tables.get('audit_logs', []):
        if content([row]) == expected['audit_logs']['contentSha256']:
            recovered['audit_logs'] = [row]
            provenance['audit_logs'] = {'method': 'existing single row with exact entire-table hash', 'source': path}
            rowids['audit_logs'] = {serialize(row): source_rowids[path]['audit_logs'][serialize(row)]}
            break
    if 'audit_logs' in recovered:
        break

assert 'projects' not in recovered
variants, submissions = {}, {}
for path, tables in source_rows.items():
    for row in tables.get('projects', []):
        variants.setdefault(row[0], set()).add(row)
    for row in tables.get('submission_versions', []):
        submissions.setdefault(row[1], []).append((row[3], row[4]))
assert len(variants) == expected['projects']['rows']
options = {}
for key, rows in sorted(variants.items()):
    columns = [set(row[i] for row in rows) for i in range(len(next(iter(rows))))]
    if len(rows) > 1:
        for payload, timestamp in submissions.get(next(iter(rows))[1], []):
            columns[3].add(payload)
            columns[6].add(timestamp)
    options[key] = list(itertools.product(*(sorted(v, key=str) for v in columns)))
combinations = 1
for values in options.values():
    combinations *= len(values)
assert combinations <= 100_000
tested = 0
for candidate in itertools.product(*options.values()):
    tested += 1
    if content(candidate) == expected['projects']['contentSha256']:
        recovered['projects'] = list(candidate)
        provenance['projects'] = {'method': 'observed project fields plus immutable submission payload/timestamp variants; exact entire-table hash', 'candidateCombinations': combinations, 'tested': tested, 'sources': list(source_rows)}
        base_ids = {row[0]: source_rowids[str(BASE)]['projects'][serialize(row)] for row in source_rows[str(BASE)]['projects']}
        rowids['projects'] = {serialize(row): base_ids[row[0]] for row in candidate}
        break
assert 'projects' in recovered, 'PROJECTS_EXACT_HASH_NOT_RECOVERED'

assert 'scoring_revision' not in recovered and expected['scoring_revision']['rows'] == 1
observed_counters = [row[1] for tables in source_rows.values() for row in tables.get('scoring_revision', []) if row[0] == 1 and isinstance(row[1], int)]
for value in range(max(observed_counters) + 1):
    candidate = [(1, value)]
    if content(candidate) == expected['scoring_revision']['contentSha256']:
        recovered['scoring_revision'] = candidate
        provenance['scoring_revision'] = {'method': 'bounded integer counter search accepted only exact entire-table hash', 'range': [0, max(observed_counters)], 'matchedVersion': value}
        rowids['scoring_revision'] = {serialize(candidate[0]): 1}
        break
assert set(recovered) == set(expected), 'RECOVERY_INCOMPLETE'
for name, data in recovered.items():
    assert len(data) == expected[name]['rows']
    assert content(data) == expected[name]['contentSha256']

connection = read_only(BASE)
base_inventory = inventory(connection)
schema = connection.execute("SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name").fetchall()
target = sqlite3.connect(str(OUTPUT))
try:
    connection.backup(target)
finally:
    connection.close()
changed = [name for name, data in recovered.items() if content(source_rows[str(BASE)].get(name, [])) != expected[name]['contentSha256']]
try:
    target.execute('PRAGMA foreign_keys=OFF')
    target.execute('BEGIN IMMEDIATE')
    # Scratch-only trigger suspension prevents audit immutability/revision hooks
    # from altering an exact historical restoration. Restore every SQL body.
    triggers = target.execute("SELECT name,sql FROM sqlite_master WHERE type='trigger' ORDER BY name").fetchall()
    for name, sql in triggers:
        target.execute('DROP TRIGGER ' + quote(name))
    for name in changed:
        columns = [r[1] for r in target.execute('PRAGMA table_info(' + quote(name) + ')')]
        target.execute('DELETE FROM ' + quote(name))
        if not recovered[name]:
            continue
        use_rowid = 'rowid' not in columns and rowids.get(name)
        insert_columns = (['rowid'] if use_rowid else []) + columns
        insert = 'INSERT INTO ' + quote(name) + '(' + ','.join(quote(c) for c in insert_columns) + ') VALUES(' + ','.join('?' for _ in insert_columns) + ')'
        for row in recovered[name]:
            values = (rowids[name][serialize(row)],) + row if use_rowid else row
            target.execute(insert, values)
    for name, sql in triggers:
        target.execute(sql)
    target.commit()
    target.execute('PRAGMA foreign_keys=ON')
    actual = inventory(target)
    assert actual == expected_document['tables'], 'FINAL_MANIFEST_MISMATCH'
    assert target.execute("SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name").fetchall() == schema, 'SCHEMA_OBJECT_MISMATCH'
    integrity = target.execute('PRAGMA integrity_check').fetchall()
    foreign_keys = target.execute('PRAGMA foreign_key_check').fetchall()
    assert integrity == [('ok',)] and foreign_keys == []
finally:
    target.close()

check = read_only(BASE)
assert inventory(check) == base_inventory
check.close()
assert digest(DAMAGED.read_bytes()) == EXPECTED_MANIFEST_SHA
assert digest(MANIFEST.read_bytes()) == EXPECTED_MANIFEST_SHA
for path, old_hash in source_hashes.items():
    assert digest(Path(path).read_bytes()) == old_hash, 'SOURCE_FILE_CHANGED: ' + path
logical = digest(json.dumps(actual, sort_keys=True, separators=(',', ':')).encode())
assert logical == expected_document['logicalSha256']
report = {'syntheticOnly': True, 'damagedFilePreserved': str(DAMAGED), 'damagedFileSha256': EXPECTED_MANIFEST_SHA, 'expectedManifest': str(MANIFEST), 'recoveredDatabase': str(OUTPUT), 'baseBackup': str(BASE), 'matchedTables': len(actual), 'expectedTables': len(expected), 'logicalSha256': logical, 'allTableSchemaAndContentHashesMatch': True, 'allSchemaObjectsRetainedExactly': True, 'integrityCheck': integrity, 'foreignKeyCheck': foreign_keys, 'restoredTables': changed, 'provenance': provenance, 'sourcesReadOnlyAndPhysicalHashesUnchanged': source_hashes, 'productionOrProviderActions': [], 'notes': ['No source database was modified or started by an application.', 'Raw recovered database remains in/tmp; no raw rows/codes are committed.', 'FK and triggers were suspended only in the new scratch and restored before final checks.', 'Logical equality is the exact pre-incident64table schema/content manifest; recovered file bytes are not claimed identical to the lostSQLite file.']}
with (HERE / 'recovery-report.json').open('x') as f:
    json.dump(report, f, indent=2)
    f.write('\n')
with (HERE / 'recovered-manifest.json').open('x') as f:
    json.dump({'database': str(OUTPUT), 'mode': 'Recovered scratch; then all64tables compared to original manifest', 'syntheticOnly': True, 'tables': actual, 'logicalSha256': logical}, f, indent=2)
    f.write('\n')
print(json.dumps({key: report[key] for key in ['recoveredDatabase','matchedTables','logicalSha256','integrityCheck','foreignKeyCheck','restoredTables']}))
