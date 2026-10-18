"""Prepare the local review without copying any imagery into tracked directories."""
import argparse
import json
import shutil
from pathlib import Path


def ordered_queues(report_root):
    return sorted(report_root.glob('batch*/queue.json'),
                  key=lambda path: int(path.parent.name.removeprefix('batch')))


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--private-root',type=Path,required=True);p.add_argument('--leaflet',type=Path,required=True);a=p.parse_args()
    private=a.private_root.resolve();review=private/'review';review.mkdir(exist_ok=True)
    here=Path(__file__).resolve().parent;shutil.copy2(here/'review.html',review/'index.html')
    shutil.copytree(a.leaflet,review/'vendor',dirs_exist_ok=True)
    report_root=here.parents[1]/'reports/crown-grant'
    queues=ordered_queues(report_root)
    records=[(q.parent,s) for q in queues for s in json.loads(q.read_text())['sheets']]
    if not records:
        records=[(report_root/'batch1',s) for s in ['002','003','004','004a','005']]
    assert len({s for _,s in records})==len(records), 'Duplicate sheet in batch queues'
    sheets=[]
    for reports,sheet in records:
        entry=dict(id=sheet,status='Queued — not started',components=[])
        record=reports/f'sheet{sheet}'/'status.json'
        if record.exists():
            status=json.loads(record.read_text());entry.update(status['review'])
            folder=private/f'sheet{sheet}';receipt=json.loads((folder/'render-receipt.json').read_text())
            link=review/f'sheet{sheet}'
            if not link.exists():link.symlink_to(folder,target_is_directory=True)
            for name,target in [('source.jpg',private/f'{sheet}-000.jpg'),('source.pdf',private/f'{sheet}.pdf'),('reference.geojson',private/f'{sheet}-water-tight.geojson')]:
                link=folder/name
                if not link.exists():link.symlink_to(target)
            shutil.copy2(record,folder/'status.json')
            entry.update(source=f'/sheet{sheet}/source.jpg',pdf=f'/sheet{sheet}/source.pdf',reference=f'/sheet{sheet}/reference.geojson',report=f'/sheet{sheet}/status.json',components=[dict(c,url=f'/sheet{sheet}/'+c['png']) for c in receipt['components']])
        sheets.append(entry)
    (review/'manifest.json').write_text(json.dumps(dict(sheets=sheets),indent=2)+'\n')
    print(review)
