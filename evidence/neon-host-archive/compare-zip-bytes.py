"""Read-only ZIP payload proof; every changed entry must be explicitly allowed."""
import argparse
import hashlib
import io
import json
import struct
import zipfile
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("--previous", required=True)
parser.add_argument("--refreshed", required=True)
parser.add_argument("--allow-entry-change", action="append", default=[])
args = parser.parse_args()
previous = Path(args.previous).read_bytes()
refreshed = Path(args.refreshed).read_bytes()
sha = lambda data: hashlib.sha256(data).hexdigest()

def normalized(data):
    output = bytearray(data)
    offsets = set()
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        for entry in archive.infolist():
            start = entry.header_offset + 10
            offsets.update(range(start, start + 4))
            output[start:start + 4] = b"\0" * 4
        position = archive.start_dir
        for _ in archive.infolist():
            assert output[position:position + 4] == b"PK\x01\x02"
            offsets.update(range(position + 12, position + 16))
            output[position + 12:position + 16] = b"\0" * 4
            name, extra, comment = struct.unpack_from("<HHH", output, position + 28)
            position += 46 + name + extra + comment
    return bytes(output), offsets

changed = []
with zipfile.ZipFile(io.BytesIO(previous)) as old, zipfile.ZipFile(io.BytesIO(refreshed)) as new:
    assert old.namelist() == new.namelist()
    for name in old.namelist():
        a, b = old.read(name), new.read(name)
        if a != b:
            changed.append({"path": name, "previousSHA256": sha(a), "sha256": sha(b), "previousBytes": len(a), "bytes": len(b)})
    entries = len(old.namelist())
assert sorted(entry["path"] for entry in changed) == sorted(args.allow_entry_change)
old_normal, old_offsets = normalized(previous)
new_normal, new_offsets = normalized(refreshed)
timestamp_only = not changed
if timestamp_only:
    assert len(previous) == len(refreshed)
    assert old_offsets == new_offsets
    assert old_normal == new_normal
    differences = [index for index, (a, b) in enumerate(zip(previous, refreshed)) if a != b]
    assert all(index in old_offsets for index in differences)
print(json.dumps({
    "previousSHA256": sha(previous),
    "refreshedSHA256": sha(refreshed),
    "entriesCompared": entries,
    "unchangedEntries": entries - len(changed),
    "changedEntries": changed,
    "allOtherEntryPayloadBytesIdentical": True,
    "allEntryPayloadBytesIdentical": not changed,
    "zipOnlyDosTimestampsDiffer": timestamp_only,
    "normalizedZipBytesIdentical": old_normal == new_normal,
    "previousNormalizedSHA256": sha(old_normal),
    "refreshedNormalizedSHA256": sha(new_normal),
    "readOnly": True,
}, indent=2))
