"""Upload this frozen revision without deleting objects; verify every R2 ETag.

Credentials are supplied by the caller's AWS environment. Nothing in this
script creates credentials or changes bucket configuration or application pins.
"""
import argparse
import hashlib
import json
import os
import subprocess
from datetime import datetime, timezone
from pathlib import Path

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--tiles', type=Path, required=True)
p.add_argument('--aws', default='aws')
p.add_argument('--out', type=Path, required=True)
a = p.parse_args()
account = os.environ['R2_ACCOUNT_ID']
bucket = 'ns-marks-fletcher-tiles'
source = json.loads((a.tiles/'source.json').read_text())
revision = source['revision']
assert revision == 'fletcher-full-sheets-20260913.1'
assert source['status'] == 'provisional-review'
items = json.loads((a.tiles/'tile-inventory.json').read_text())
paths = {i['path'] for i in items} | {'source.json','tile-inventory.json'}
assert paths == {str(f.relative_to(a.tiles)) for f in a.tiles.rglob('*') if f.is_file()}
assert source['tileCount'] == len(items) == 44340
for key in ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY']:
    assert os.environ.get(key), key + ' is required'
os.environ['AWS_DEFAULT_REGION'] = 'auto'
os.environ['AWS_EC2_METADATA_DISABLED'] = 'true'
cmd = [a.aws, '--endpoint-url', f'https://{account}.r2.cloudflarestorage.com']

def call(*args):
    return subprocess.check_output(cmd + list(args), text=True)

# Existing objects in this exact task revision may be resumed. Other prefixes
# are never touched; sync is intentionally run without --delete.
print('Uploading', len(paths), 'objects to', bucket+'/'+revision, flush=True)
first = items[0]['path']
subprocess.run(cmd+['s3','cp',str(a.tiles/first),f's3://{bucket}/{revision}/{first}','--content-type','image/png','--cache-control','public, max-age=31536000, immutable','--only-show-errors'],check=True)
subprocess.run(cmd+['s3','sync',str(a.tiles),f's3://{bucket}/{revision}/','--exclude','*.json','--content-type','image/png','--cache-control','public, max-age=31536000, immutable','--only-show-errors','--no-progress'],check=True)
# Manifests arrive only after the tile transfer succeeds.
subprocess.run(cmd+['s3','sync',str(a.tiles),f's3://{bucket}/{revision}/','--exclude','*','--include','*.json','--content-type','application/json','--cache-control','public, max-age=31536000, immutable','--only-show-errors','--no-progress'],check=True)
print('Checking complete R2 object listing and ETags', flush=True)
remote = json.loads(call('s3api','list-objects-v2','--bucket',bucket,'--prefix',revision+'/','--output','json')).get('Contents',[])
objects = {o['Key'][len(revision)+1:]:o for o in remote}
assert objects.keys() == paths, 'Remote inventory differs'
bytes_total = 0
for rel in sorted(paths):
    f = a.tiles/rel
    with f.open('rb') as stream:
        md5 = hashlib.file_digest(stream,'md5').hexdigest()
    assert objects[rel]['Size'] == f.stat().st_size, rel
    assert objects[rel]['ETag'].strip('"') == md5, rel
    bytes_total += f.stat().st_size
receipt = {'revision':revision,'bucket':bucket,'public_root':'https://tiles.kinnokilabs.com/'+revision,'verified_at':datetime.now(timezone.utc).isoformat(),'objects':len(paths),'tile_objects':len(items),'bytes':bytes_total,'all_remote_sizes_and_md5_etags_match':True,'source_sha256':hashlib.sha256((a.tiles/'source.json').read_bytes()).hexdigest(),'inventory_sha256':source['inventorySha256'],'geographic_acceptance_changed':False,'application_pins_changed':False}
a.out.write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps(receipt,indent=2),flush=True)
