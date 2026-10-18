#!/usr/bin/env python3
"""Build the Nova Scotia NAR lookup, retaining source address IDs.

python3 scripts/generateMailingAddresses.py [--addresses CSV --locations CSV]
With no inputs, fetch only the two NS members of the pinned national ZIP using
HTTP ranges. Verify each extracted member against its SHA-256 before generating.
No residents, businesses, ownership, PIDs, or civic-point matches are generated.
"""
import argparse
import csv
import gzip
import hashlib
import io
import json
import math
from pathlib import Path
import re
import struct
import subprocess
import unicodedata
import zipfile
import zlib

URL = 'https://www150.statcan.gc.ca/n1/pub/46-26-0002/2022001/202606.zip'
INPUTS = {
    'addresses': ('Addresses/Address_12.csv', '097982b0b694fff4cb39753d2592f8d24141de7ba10c1840c4cf0a33e0aa838e'),
    'locations': ('Locations/Location_12.csv', '52f39ac102dd4406c9526f17aff5f6a1148fe3ae67f100c7619dba1d6d53cf50'),
}
# Keep in sync with normalizeAddress in services/mailingAddresses.ts.
ALIASES = {'road':'rd','street':'st','avenue':'ave','drive':'dr','lane':'ln',
           'highway':'hwy','route':'hwy','boulevard':'blvd','court':'crt',
           'place':'pl','crescent':'cres','terrace':'terr','trail':'trl',
           'north':'n','south':'s','east':'e','west':'w'}
def normalize(value):
    value = ''.join(c for c in unicodedata.normalize('NFKD', value.lower()) if not unicodedata.combining(c))
    value = re.sub(r"[.'’]", '', value)
    return ' '.join(ALIASES.get(word, word) for word in re.sub(r'[^a-z0-9]+', ' ', value).split())

def shard(key):
    value = 2166136261
    for char in key:
        value = ((value ^ ord(char)) * 16777619) & 0xffffffff
    return f'{value % 128:02x}'

def download_members():
    def fetch(byte_range):
        return subprocess.check_output(['curl','--fail','--silent','--show-error','--location',
                                        '--max-time','120','--range',byte_range,URL])
    tail = fetch('-65536')
    # ZIP central-directory offsets are adjusted by ZipFile for this tail-only file.
    archive = zipfile.ZipFile(io.BytesIO(tail))
    eocd = tail.rfind(b'PK\x05\x06')
    central_size, central_offset = struct.unpack_from('<II',tail,eocd+12)
    tail_start = central_offset + central_size - eocd
    result = {}
    for key,(member,_) in INPUTS.items():
        info = archive.getinfo(member)
        start = info.header_offset + tail_start
        header = fetch(f'{start}-{start+29}')
        values = struct.unpack('<4s5H3I2H',header)
        if values[0] != b'PK\x03\x04' or values[3] != 8:
            raise ValueError('Unsupported source ZIP member')
        data_start = start + 30 + values[-2] + values[-1]
        compressed = fetch(f'{data_start}-{data_start+info.compress_size-1}')
        data = zlib.decompress(compressed,-15)
        if len(data) != info.file_size or zlib.crc32(data) != info.CRC:
            raise ValueError('ZIP member failed integrity check')
        result[key] = data
    return result

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--addresses',type=Path)
    parser.add_argument('--locations',type=Path)
    parser.add_argument('--output',type=Path,default=Path(__file__).resolve().parents[1]/'public/mailing-addresses')
    args = parser.parse_args()
    if bool(args.addresses) != bool(args.locations):
        parser.error('Provide both source CSV files or neither')
    data = {key:getattr(args,key).read_bytes() for key in INPUTS} if args.addresses else download_members()
    for key,(_,checksum) in INPUTS.items():
        if hashlib.sha256(data[key]).hexdigest() != checksum:
            raise ValueError(f'{key} changed; review source and licence before repinning')
    def rows(key): return csv.DictReader(io.StringIO(data[key].decode('utf-8-sig')))
    locations = {}
    for row in rows('locations'):
        try: lon,lat = float(row['BG_LONGITUDE']),float(row['BG_LATITUDE'])
        except ValueError: continue
        if math.isfinite(lon) and math.isfinite(lat) and -67 <= lon <= -59 and 43 <= lat <= 48:
            locations[row['LOC_GUID']] = [lon,lat]
    roads = {}
    counts = {'sourceAddresses':0,'included':0,'missingBuildingCoordinate':0,'incompleteMailingAddress':0}
    for row in rows('addresses'):
        counts['sourceAddresses'] += 1
        point = locations.get(row['LOC_GUID'])
        if point is None:
            counts['missingBuildingCoordinate'] += 1
            continue  # Never substitute the less precise blockface coordinate.
        if not all(row[k].strip() for k in ['CIVIC_NO','OFFICIAL_STREET_NAME','MAIL_STREET_NAME','MAIL_MUN_NAME','MAIL_POSTAL_CODE']) or row['MAIL_PROV_ABVN'] != 'NS':
            counts['incompleteMailingAddress'] += 1
            continue
        road = ' '.join(row[k] for k in ['OFFICIAL_STREET_NAME','OFFICIAL_STREET_TYPE','OFFICIAL_STREET_DIR'] if row[k])
        key = normalize(road)
        record = dict(id=row['ADDR_GUID'], number=row['CIVIC_NO'],suffix=row['CIVIC_NO_SUFFIX'],unit=row['APT_NO_LABEL'],
                      road=road,street=' '.join(row[k] for k in ['MAIL_STREET_NAME','MAIL_STREET_TYPE','MAIL_STREET_DIR'] if row[k]),
                      city=row['MAIL_MUN_NAME'],postalCode=row['MAIL_POSTAL_CODE'],additional=row['BU_N_CIVIC_ADD'],coordinates=point)
        roads.setdefault(key,[]).append(record)
        counts['included'] += 1
    args.output.mkdir(parents=True,exist_ok=True)
    hashes = {}
    def write(name,value):
        payload = gzip.compress(json.dumps(value,ensure_ascii=False,separators=(',',':')).encode(),mtime=0)
        (args.output/name).write_bytes(payload)
        hashes[name] = hashlib.sha256(payload).hexdigest()
    index = []
    shards = {f'{i:02x}':{} for i in range(128)}
    for key,records in sorted(roads.items()):
        records.sort(key=lambda r:(int(r['number']) if r['number'].isdigit() else 0,r['suffix'],r['unit'],r['id']))
        shards[shard(key)][key] = records
        index.append(dict(key=key,cities=sorted({r['city'] for r in records})))
    write('index.json.gz',dict(version=1,streets=index))
    for name,streets in shards.items(): write(f'{name}.json.gz',dict(version=1,streets=streets))
    receipt = dict(source='Statistics Canada, National Address Register',referenceDate='2026-06',
        sourceUrl='https://www150.statcan.gc.ca/n1/pub/46-26-0002/462600022022001-eng.htm',archiveUrl=URL,
        inputs={member:checksum for member,checksum in INPUTS.values()},counts=counts,
        licenceUrl='https://www.statcan.gc.ca/en/terms-conditions/open-licence',
        attribution='Adapted from Statistics Canada, National Address Register, June 2026. This does not constitute an endorsement by Statistics Canada of this product.',
        coordinatePolicy='Building coordinates only; missing coordinates and incomplete mailing addresses omitted. No blockface substitution.',
        matchingPolicy='Runtime exact normalized civic number, suffix, unit and road plus at most 50 metres; multiple source address IDs remain ambiguous.',
        files=hashes)
    (args.output/'source.json').write_text(json.dumps(receipt,indent=2)+'\n')
    print(json.dumps(counts));print(f'{len(roads)} road keys; {sum(p.stat().st_size for p in args.output.glob("*.gz")):,} compressed bytes')

if __name__ == '__main__':main()
