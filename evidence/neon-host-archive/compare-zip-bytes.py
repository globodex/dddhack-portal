"""Read-only proof of payload equivalence and DOS-timestamp-only ZIP changes."""
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

with zipfile.ZipFile(io.BytesIO(previous)) as old, zipfile.ZipFile(io.BytesIO(refreshed)) as new:
    assert old.namelist() == new.namelist()
    assert all(old.read(name) == new.read(name) for name in old.namelist())
    entries = len(old.namelist())
old_normal, old_offsets = normalized(previous)
new_normal, new_offsets = normalized(refreshed)
assert len(previous) == len(refreshed)
assert old_offsets == new_offsets
assert old_normal == new_normal
changed = [index for index, (a, b) in enumerate(zip(previous, refreshed)) if a != b]
assert all(index in old_offsets for index in changed)
print(json.dumps({
    "previousSHA256": sha(previous),
    "refreshedSHA256": sha(refreshed),
    "entriesCompared": entries,
    "allEntryPayloadBytesIdentical": True,
    "timestampFieldOffsetsEqual": True,
    "zipBytesChanged": len(changed),
    "zipNonTimestampBytesChanged": 0,
    "normalizedSHA256": sha(new_normal),
    "normalizedZipBytesIdentical": True,
    "readOnly": True,
}, indent=2))
