"""Read-only source analysis; lossless candidate PNGs are written only under /tmp."""
import hashlib
import io
import json
import pathlib
import struct
import tempfile
import zlib
from PIL import Image

own_root = pathlib.Path(__file__).resolve().parent.parent
source_root = own_root / 'public/art/delhi-v3'
preview_root = own_root.parent / 'visual-integration/dist/client/art/delhi-v3'
output = pathlib.Path(tempfile.mkdtemp(prefix='ddehack-lossless-feasibility-', dir='/tmp'))
names = ['fallback-approved-v3.png', 'delhi-fill-overscan.png', 'metro-static.png', 'text-mask-alpha.png']
report = {'scope': 'Feasibility only. No repository asset changes, no network, no format/quality changes. Candidates live only in /tmp.', 'strategy': 'Recompress identical PNG IDAT scanlines using zlib level9 and one IDAT chunk; retain all non-IDAT chunks byte-for-byte.', 'candidatesDirectory': str(output), 'rows': []}

def chunks(blob):
    assert blob[:8] == b'\x89PNG\r\n\x1a\n'
    result = []
    offset = 8
    while offset < len(blob):
        length = struct.unpack('>I', blob[offset:offset+4])[0]
        kind = blob[offset+4:offset+8]
        data = blob[offset+8:offset+8+length]
        raw = blob[offset:offset+length+12]
        crc = struct.unpack('>I', raw[-4:])[0]
        assert zlib.crc32(kind + data) & 0xffffffff == crc
        result.append((kind, data, raw))
        offset += length + 12
    assert offset == len(blob)
    return result

def make_chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)

for name in names:
    original = (source_root / name).read_bytes()
    served = (preview_root / name).read_bytes()
    assert original == served, 'Fork asset differs from measured preview asset; do not attribute this candidate to baseline.'
    original_chunks = chunks(original)
    inflated = zlib.decompress(b''.join(data for kind, data, _ in original_chunks if kind == b'IDAT'))
    compressed = zlib.compress(inflated, level=9)
    result = original[:8]
    replaced = False
    for kind, _, raw in original_chunks:
        if kind == b'IDAT':
            if not replaced:
                result += make_chunk(b'IDAT', compressed)
                replaced = True
        else:
            result += raw
    candidate_chunks = chunks(result)
    assert zlib.decompress(b''.join(data for kind, data, _ in candidate_chunks if kind == b'IDAT')) == inflated
    assert [raw for kind, _, raw in original_chunks if kind != b'IDAT'] == [raw for kind, _, raw in candidate_chunks if kind != b'IDAT']
    with Image.open(io.BytesIO(original)) as before, Image.open(io.BytesIO(result)) as after:
        before.load(); after.load()
        assert before.mode == after.mode and before.size == after.size
        assert before.tobytes() == after.tobytes(), 'Independent Pillow decoding differs.'
        pixel_hash = hashlib.sha256(before.tobytes()).hexdigest()
        dimensions = before.size
        mode = before.mode
    (output / name).write_bytes(result)
    row = {'asset': name, 'originalBytes': len(original), 'candidateBytes': len(result), 'savedBytes': len(original)-len(result), 'savedPercent': 100*(len(original)-len(result))/len(original), 'dimensions': list(dimensions), 'mode': mode, 'sourceMatchesMeasuredPreview': True, 'inflatedScanlinesIdentical': True, 'nonIDATChunksIdentical': True, 'independentlyDecodedPixelsIdentical': True, 'decodedPixelSHA256': pixel_hash, 'originalSHA256': hashlib.sha256(original).hexdigest(), 'candidateSHA256': hashlib.sha256(result).hexdigest()}
    report['rows'].append(row)
    print(json.dumps(row), flush=True)
(own_root / 'docs/performance-png-feasibility.json').write_text(json.dumps(report, indent=2) + '\n')
