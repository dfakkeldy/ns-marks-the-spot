"""Replay the frozen three-round record, control preservation and score isolation."""
import tempfile
from pathlib import Path
import work as w
rows=[]
with tempfile.TemporaryDirectory() as tmp:
    for s,conf in w.CONFIG.items():
        folder=w.HERE/f'sheet-{s}';baseline=w.read(folder/'baseline-fit.json')
        assert baseline==w.read(w.ROOT/conf['fit'])
        original={p['id']:p for p in baseline['points'] if p['id'].startswith('gcp-')}
        for r in range(4):
            name='baseline' if r==0 else f'round-{r}'
            path=folder/f'{name}-fit.json';fit=w.read(path)
            assert {p['id']:p for p in fit['points'] if p['id'].startswith('gcp-')}==original
            assert fit['source_sha256']==baseline['source_sha256']
            assert fit['source_dimensions']==baseline['source_dimensions']
            actual=w.score(path,folder/'checks.json',Path(tmp)/'scores.json')
            stored=w.read(folder/f'{name}-scores.json')
            assert actual.keys()==stored.keys()
            assert actual['fit_sha256']==stored['fit_sha256']
            assert actual['checks_sha256']==stored['checks_sha256']
            for metric in ['rms_ground_m','median_ground_m','worst_ground_m']:
                assert abs(actual[metric]-stored[metric])<.001,(s,r,metric)
            if r:
                decision=w.read(folder/f'round-{r}-decision.json')
                assert abs(decision['after_rms_ground_m']-actual['rms_ground_m'])<.001
                if decision['proposal']:
                    trial=w.score(folder/f'round-{r}-trial-fit.json',folder/'checks.json',Path(tmp)/'trial.json')
                    assert abs(trial['rms_ground_m']-decision['trial_rms_ground_m'])<.001
                before=w.read(folder/('baseline-scores.json' if r==1 else f'round-{r-1}-scores.json'))
                assert abs(decision['before_rms_ground_m']-before['rms_ground_m'])<.001
        rows.append(dict(sheet=s,unchanged_hand_controls=len(original),check_count=len(w.read(folder/'checks.json')['points']),all_rounds_replayed=True))
    for r in range(1,4):
        prior='baseline' if r==1 else f'round-{r-1}'
        expected=sorted(w.CONFIG,key=lambda s:-w.read(w.HERE/f'sheet-{s}/{prior}-scores.json')['rms_ground_m'])
        assert [a['sheet'] for a in w.read(w.HERE/f'round-{r}-order.json')]==expected
w.write(w.HERE/'packet-verification.json',dict(sheets=rows,hand_controls_preserved=sum(r['unchanged_hand_controls'] for r in rows),descending_order_verified_for_all_rounds=True,scope='Frozen score replay and provenance; not fresh geographic validation.'))
print(rows)
