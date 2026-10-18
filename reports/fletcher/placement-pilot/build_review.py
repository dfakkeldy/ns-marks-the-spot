"""Build the bounded research review; never updates inventories or map layers.

Requires Pillow and GDAL CLI. Inputs are the frozen, locally held scan, warp,
and NSTDB download; their hashes must match the existing repository receipts.
"""
from pathlib import Path
import argparse
import hashlib
import html
import json
import math
import shutil
import subprocess
import sys
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[2]
sys.path.insert(0, str(REPO))
from tools.fletcher.annotation_placement import place_review
from tools.fletcher.physical_qa import _convex_hull
R = 6378137

def read(path):
    return json.loads(path.read_text())

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def merc(ll):
    return [R * math.radians(ll[0]), R * math.log(math.tan(math.pi / 4 + math.radians(ll[1]) / 2))]

def lonlat(xy):
    return [math.degrees(xy[0] / R), math.degrees(2 * math.atan(math.exp(xy[1] / R)) - math.pi / 2)]

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source', type=Path, required=True)
    p.add_argument('--raster', type=Path, required=True)
    p.add_argument('--references', type=Path, required=True)
    args = p.parse_args()
    receipt = read(ROOT.parent / 'visual-expansion/artifact-receipt.json')
    observations = ROOT.parent / 'visual-expansion/sheet-observations.json'
    assert digest(args.source) == receipt['source']['sha256']
    assert digest(args.raster) == receipt['artifacts'][0]['sha256']
    assert digest(observations) == receipt['observations_sha256']
    references = read(ROOT.parent / 'matching-benchmark/reference-receipts.json')
    references += read(ROOT / 'road-context-receipts.json')
    vectors = {}
    for ref in references:
        file = args.references / (ref['name'] + '.geojson')
        assert digest(file) == ref['sha256']
        vectors[ref['name']] = read(file)['features']
    points = read(observations)['points']
    controls = [a for a in points if a['role'] == 'control']
    assert len(controls) == 39 and sum(a['role'] == 'check' for a in points) == 8
    gcps = []
    for a in controls:
        gcps += ['-gcp', *map(str, a['pixel_xy']), *map(str, merc(a['lonlat']))]
    gdal = shutil.which('gdaltransform')
    translate = shutil.which('gdal_translate')
    assert gdal and translate
    inventories = REPO / 'docs/fletcher/label-extraction'
    features = {a['id']: a for name in ['judique-pilot', 'judique-inland', 'judique-south', 'judique-southeast'] for a in read(inventories / (name + '.json'))['features']}
    associations = {a['annotation_id']: a for a in read(ROOT / 'source-review.json')['associations']}
    decisions = read(ROOT / 'locality-review.json')
    records = read(ROOT / 'mining-records.json')
    source = Image.open(args.source)
    assert source.size == (10815, 7549)
    out = ROOT / 'images'
    out.mkdir(exist_ok=True)
    font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 18) if Path('/System/Library/Fonts/Supplemental/Arial.ttf').exists() else ImageFont.load_default()
    cases = []
    mapped_features = []
    hull = _convex_hull([tuple(p['pixel_xy']) for p in controls])
    def transform_native(rows):
        result = subprocess.run([gdal, '-tps', *gcps],
                                input=''.join(f'{x} {y}\n' for x,y in rows),
                                text=True, capture_output=True, check=True)
        return [lonlat(list(map(float, line.split()[:2]))) for line in result.stdout.splitlines()]
    for suffix, decision in decisions.items():
        aid = 'F19-JUD-' + suffix
        feature = features[aid]
        assoc = associations[aid]
        placement = place_review(assoc, source.size, hull, transform_native, 'draft-supported-area')
        mapped_features.append({'type':'Feature', 'id':aid, 'geometry':placement['geometry'], 'properties':{
            'name':feature['source_text'].replace('\n',' / '), 'annotation_id':aid,
            'sheet_id':'19', 'source_text':feature['source_text'],
            'placement_status':placement['placement_status'], 'alignment_status':placement['alignment_status'],
            'publication_status':'research-preview-only',
            'alignment_evidence':'https://github.com/dfakkeldy/ns-marks-the-spot/blob/nightly/reports/fletcher/judique-boundary/README.md',
            'description':'Approximate position derived from the original Fletcher symbol or bounded group. Group areas bound ambiguous printed marks, not mill grounds. Judique alignment is a supported-area draft; full-sheet checks failed. Not a surveyed site.',
            'geometry_basis':'reviewed-printed-symbol' if assoc['source_anchor_xy'] else 'bounded-source-group',
            'source_geometry_native':placement['source_geometry_native'],
            'source_dimensions':list(source.size), 'source_sha256':receipt['source']['sha256'],
            'observations_sha256':digest(observations), 'source_review_sha256':digest(ROOT/'source-review.json'),
            'transform':'GDAL TPS, frozen 39 controls, native xy to EPSG:3857 then longitude/latitude',
            'review_url':f'review.html#{aid}', 'source_url':receipt['source']['iiif'],
            'attribution':receipt['source']['attribution'], 'license':'CC BY-NC-SA 3.0',
            'rights_record':'https://github.com/dfakkeldy/ns-marks-the-spot/blob/nightly/reports/fletcher/INVENTORY.md'
        }})
        correction = decision.get('placement_correction')
        if correction:
            # Keep the original source association and warp prediction intact.
            # A local correction must identify its separate modern reference.
            assert correction['status'] == 'locally-reviewed-approximate'
            assert correction['geometry']['type'] == 'Point'
            assert correction['geometry']['coordinates'] == correction['modern_reference']['geometry_lonlat']
            mapped_features[-1]['geometry'] = correction['geometry']
            mapped_features[-1]['properties'].update({
                'placement_status': correction['status'],
                'geometry_basis': 'local-review-with-modern-church-reference',
                'map_derived_geometry': placement['geometry'],
                'placement_correction': correction,
                'transform': 'Local church placement correction; original frozen TPS prediction retained in map_derived_geometry.',
                'description': 'Approximate church location corrected east of Highway 19 using local review and the identified modern church reference. The original Fletcher symbol and rejected warp prediction remain in the evidence. Exact historical footprint unresolved.'
            })
        xy = assoc['source_anchor_xy']
        origin = 'reviewed-printed-symbol'
        if xy is None:
            regions = assoc['candidate_symbol_regions_xywh']
            if regions:
                left = min(b[0] for b in regions); top = min(b[1] for b in regions)
                right = max(b[0]+b[2] for b in regions); bottom = max(b[1]+b[3] for b in regions)
                xy = [(left+right)/2, (top+bottom)/2]
                origin = 'unresolved-source-group-centre'
            else:
                b = feature['source_label_boxes_xywh'][0]
                xy = [b[0]+b[2]/2, b[1]+b[3]/2]
                origin = 'label-centre-search-only'
        result = subprocess.run([gdal, '-tps', *gcps], input=f'{xy[0]} {xy[1]}\n', text=True, capture_output=True, check=True)
        wm = list(map(float, result.stdout.split()[:2])); ll = lonlat(wm)
        # Operational search window, not a confidence region or observed site boundary.
        half = decision['search_half_width_ground_m'] / math.cos(math.radians(ll[1]))
        polygon = [lonlat([wm[0]+dx, wm[1]+dy]) for dx,dy in [(-half,-half),(half,-half),(half,half),(-half,half),(-half,-half)]]
        west, north, extent = wm[0]-1800, wm[1]+1800, 3600
        px = extent / 800
        png = out / (aid + '-warp.png')
        subprocess.run([translate, '-q', '-of', 'PNG', '-projwin', str(west), str(north), str(west+extent), str(north-extent), '-outsize', '800', '800', str(args.raster), str(png)], check=True, capture_output=True)
        raster_image = Image.open(png)
        if raster_image.mode == 'RGBA':
            hist = Image.new('RGB', raster_image.size, '#ececec'); hist.paste(raster_image, mask=raster_image.getchannel('A'))
        else:
            hist = raster_image.convert('RGB')
        modern = Image.new('RGB', (800,800), '#f8f4e7')
        md = ImageDraw.Draw(modern); hd = ImageDraw.Draw(hist)
        def pixel(ll):
            a = merc(ll); return [(a[0]-west)/px, (north-a[1])/px]
        scene_ids = {}
        highway19_label_positions = []
        for name, color, width in [('water-polygons','#cce4ee',1), ('water-lines','#277baf',2), ('roads','#6b5948',3), ('rail','#888888',1), ('highways','#ad5e25',5), ('bridges','#7b401d',4)]:
            scene_ids[name] = set()
            for f in vectors[name]:
                geom = f['geometry']; typ = geom['type']; coords = geom['coordinates']
                groups = [[coords]] if typ == 'LineString' else [coords] if typ in ['MultiLineString','Polygon'] else coords if typ == 'MultiPolygon' else []
                for rings in groups:
                    for ring_index, line in enumerate(rings):
                        pts = [pixel(q) for q in line]
                        if pts and min(q[0] for q in pts)<800 and max(q[0] for q in pts)>0 and min(q[1] for q in pts)<800 and max(q[1] for q in pts)>0:
                            if name == 'water-polygons':
                                md.polygon(pts, fill=color if ring_index == 0 else '#f8f4e7')
                            else:
                                md.line(pts, fill=color, width=width)
                            scene_ids[name].add(f['properties']['OBJECTID'])
                            if name == 'highways' and f['properties'].get('RTE_NO') == 19:
                                highway19_label_positions += [q for q in pts if 50 < q[0] < 670 and 50 < q[1] < 750]
        if highway19_label_positions:
            hx,hy = min(highway19_label_positions, key=lambda q:(q[0]-400)**2+(q[1]-200)**2)
            md.text((hx+9,hy-22), 'Highway 19', fill='#854318', font=font, stroke_width=2, stroke_fill='#f8f4e7')
        for draw in [md,hd]:
            draw.rectangle((400-half/px,400-half/px,400+half/px,400+half/px), outline='#aa620a', width=2)
            geometry = correction['geometry'] if correction and draw is md else placement['geometry']
            if geometry:
                if geometry['type'] == 'Point':
                    gx,gy = pixel(geometry['coordinates'])
                    draw.ellipse((gx-7,gy-7,gx+7,gy+7), outline='#00695c', width=3)
                else:
                    polygons = [geometry['coordinates']] if geometry['type'] == 'Polygon' else geometry['coordinates']
                    for poly in polygons:
                        draw.line([tuple(pixel(p)) for p in poly[0]], fill='#00695c', width=3)
        if correction:
            old_x, old_y = pixel(placement['geometry']['coordinates'])
            md.line((old_x-6,old_y-6,old_x+6,old_y+6), fill='#777777', width=2)
            md.line((old_x-6,old_y+6,old_x+6,old_y-6), fill='#777777', width=2)
            gx, gy = pixel(correction['geometry']['coordinates'])
            md.text((gx+12,gy-26), "St. Andrew's church", fill='#00695c', font=font, stroke_width=2, stroke_fill='#f8f4e7')
            md.text((gx+12,gy-3), 'Reviewed: east of Highway 19', fill='#00695c', font=font, stroke_width=2, stroke_fill='#f8f4e7')

        label_rectangles = []
        for ref in records.get(aid, []):
            x,y = pixel(ref['geometry_lonlat'])
            if 0 <= x <= 800 and 0 <= y <= 800:
                md.ellipse((x-6,y-6,x+6,y+6), outline='#6826a0', width=3)
                label = ref['record_id'] + ' / ' + str(ref['geo_id'])
                tx = min(x+12, 790-md.textlength(label,font=font)); ty=y-14
                while any(abs(ty-oy)<25 and abs(tx-ox)<260 for ox,oy in label_rectangles):
                    ty += 28
                label_rectangles.append((tx,ty))
                md.line((x+6,y,tx,ty+10),fill='#6826a0',width=1)
                md.text((tx,ty), label, fill='#6826a0', font=font,stroke_width=1,stroke_fill='#f8f4e7')
        pair = Image.new('RGB',(1600,880),'white'); pair.paste(hist,(0,80)); pair.paste(modern,(800,80)); d = ImageDraw.Draw(pair)
        d.text((10,5),aid+' '+feature['source_text'].replace('\n',' / '),font=font,fill='black')
        d.text((10,30),'Historical source mark / corrected modern church. Teal: reviewed point; grey X: rejected warp prediction.' if correction else 'Historical draft / NSTDB, same extent. Teal: mapped symbol/group. Ochre: research window, not site extent.',font=font,fill='black')
        d.text((10,55),'North up, same extent. Modern church: OpenStreetMap contributors (ODbL). Rust: Highway 19. Historical footprint unresolved.' if correction else 'North up. Rust: highways; brown: roads/bridges; grey: rail. Purple: provincial records. Grey fill: outside draft.',font=font,fill='black')
        pair.save(out / (aid+'-pair.jpg'), quality=88)
        raster_image.close(); png.unlink(); Path(str(png)+'.aux.xml').unlink(missing_ok=True)
        x,y = int(xy[0]-325), int(xy[1]-225)
        crop = source.crop((x,y,x+650,y+450)); draw = ImageDraw.Draw(crop)
        if assoc['source_anchor_xy']:
            cx,cy=xy[0]-x,xy[1]-y
            for line in [(cx-15,cy,cx-5,cy),(cx+5,cy,cx+15,cy),(cx,cy-15,cx,cy-5),(cx,cy+5,cx,cy+15)]: draw.line(line,fill='#ee1939',width=2)
        for bx,by,bw,bh in assoc['candidate_symbol_regions_xywh']:
            draw.rectangle((bx-x,by-y,bx+bw-x,by+bh-y),outline='#ef1678',width=2)
        crop.save(out / (aid+'-native.jpg'), quality=94)
        context = f"https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/{x},{y},650,450/650,450/0/default.jpg"
        case = {'annotation_id':aid,'source_text':feature['source_text'],'source_review':assoc,'review':decision,'map_derived_placement':placement,'historical_site_geometry':None,'placement_status':'candidate-area-only','search_centre_lonlat':ll,'search_centre_source_xy':xy,'search_centre_origin':origin,'search_geometry':{'type':'Polygon','coordinates':[polygon]},'search_geometry_meaning':'Operational research window; not a site boundary, confidence interval, or verified coverage guarantee. Centre is frozen-TPS prediction, not an independent match.','source_context_url':context,'source_crop':{'native_xywh':[x,y,650,450],'display_size':[650,450],'rotation_degrees':0},'pair_extent_epsg3857':[west,north-extent,west+extent,north],'pair_panel_size':[800,800],'modern_context_object_ids':{k:sorted(v) for k,v in scene_ids.items()},'context_id_meaning':'Features drawn in the comparison extent, not individual accepted correspondences.','external_records':records.get(aid,[]),'reviewer':'Codex coordinator; visual native-symbol and geographic-context review, 2026-09-06'}
        cases.append(case)
    data = {'title':'Fletcher sheet 19 placement pilot','reviewed_at':'2026-09-06','source_sha256':receipt['source']['sha256'],'observations_sha256':digest(observations),'raster_sha256':digest(args.raster),'modern_references':references,'modern_crs':'EPSG:4326, longitude then latitude; acquisition requested outSR=4326. Display EPSG:3857.','transform':'Frozen GDAL TPS, 39 controls; all 8 check rows excluded. No fitting or control edits in this pilot.','precision_note':'Existing diagnostic checks: 20–94 ground m, median 68 m. They are not per-site accuracy or confidence limits. Search widths are reviewer-selected operational windows.','cases':cases}
    (ROOT/'pilot.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
    collection = {'type':'FeatureCollection', 'name':'Fletcher Judique — approximate mapped annotations',
                  'alignment_status':'draft-supported-area', 'publication_status':'research-preview-only',
                  'alignment_evidence':'../judique-boundary/README.md', 'features':mapped_features}
    (ROOT/'mapped-annotations.geojson').write_text(json.dumps(collection, ensure_ascii=False, indent=2)+'\n')
    queue = [{'annotation_id':aid, 'source_text':feature['source_text'],
              'source_label_boxes_xywh':feature['source_label_boxes_xywh'],
              'status':'needs-source-review'} for aid,feature in features.items() if aid not in associations]
    (ROOT/'mapping-queue.json').write_text(json.dumps({'sheet_id':'19', 'source_sha256':receipt['source']['sha256'],
        'source_dimensions':list(source.size), 'remaining':len(queue), 'annotations':queue},ensure_ascii=False,indent=2)+'\n')
    esc = html.escape
    content = ['<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Judique placement pilot</title><style>body{font:17px/1.55 system-ui;color:#28261e;background:#faf7ee;max-width:1500px;margin:auto;padding:24px}a{color:#754008}h1{font-family:Georgia;font-size:2.3rem}section{background:white;padding:24px;margin:25px 0;border-top:4px solid #ce8241}img{max-width:100%;height:auto}nav{display:flex;gap:14px;flex-wrap:wrap}.note{background:#f2dfbc;padding:16px}summary{cursor:pointer}small{display:block;color:#514d40}figure{margin:15px 0}@media(max-width:600px){body{padding:12px}section{padding:12px}}</style><h1>Judique: 12 annotations on modern geography</h1><p class="note"><b>Reviewed placement: eight approximate points and four group areas.</b> Teal marks follow reviewed source symbols/groups, with the church corrected east of Highway 19 from local review and a modern church reference. Its rejected warp point remains as a grey X. Judique is a supported-area draft; its full-sheet accuracy check failed. Search boxes are research windows, not mill boundaries or measured uncertainty. Every original inventory geometry remains null.</p><p><b>Road context corrected September 6:</b> Highway 19 and the separate highway/bridge layers are now included. Earlier missing-road conclusions based on the incomplete road layer have been withdrawn.</p><p>Four mill annotations, three mine annotations, a school, forge, stables, church and bridge. <a href="README.md">Method and results</a> · <a href="pilot.json">Full evidence data</a></p><nav>']
    content[0] = content[0].replace('<nav>', '<p><a href="mapped-annotations.geojson" download>Download approximate annotation layer (GeoJSON)</a> · <a href="mapping-queue.json">121 labels awaiting source-mark review</a>. Import through the shared file drop zone; the layer appears under Your data. Coordinates come from Fletcher except the explicitly corrected church location. Historical records and local review retain their separate provenance.</p><nav>')
    content += [f'<a href="#{c["annotation_id"]}">{esc(c["source_text"].replace(chr(10)," / "))} {c["annotation_id"][-3:]}</a>' for c in cases]
    content.append('</nav>')
    board = ROOT/'images/mill-board.jpg'
    if board.exists(): content.append('<figure><img src="images/mill-board.jpg" alt="Mill annotations A, B, C and separate Rory Chisholm Brook annotation D"><figcaption>Letters identify historical annotations only. They do not select individual buildings.</figcaption></figure>')
    for c in cases:
        aid=c['annotation_id']; d=c['review']; ll=d['placement_correction']['geometry']['coordinates'] if d.get('placement_correction') else c['search_centre_lonlat']
        modern_label = 'Modern map centred on corrected church' if d.get('placement_correction') else 'Modern map centred on search area'
        content.append(f'<section id="{aid}"><h2>{esc(c["source_text"].replace(chr(10)," / "))} · {aid}</h2><p>{esc(d["evidence"])}</p><p><b>Unresolved details:</b> {esc(d["contradictions"])}</p><p><b>Optional historical research:</b> {esc(d["next"])}</p><p><a href="{c["source_context_url"]}">Original scan excerpt</a> · <a href="https://www.openstreetmap.org/#map=16/{ll[1]:5f}/{ll[0]:5f}">{modern_label}</a></p><img src="images/{aid}-pair.jpg" alt="{aid}: historical and modern geography at the same extent"><details><summary>Native printed symbol and source review</summary><p>{esc(c["source_review"]["note"])}</p><img src="images/{aid}-native.jpg" alt="Native source detail for {aid}"><small>Original scan crop {c["source_crop"]["native_xywh"]}; displayed at 1:1, unrotated. Red crosshair: reviewed mark. Pink boxes: unresolved group.</small></details>')
        if d.get('placement_correction'):
            ref = d['placement_correction']['modern_reference']
            content.append(f'<p><b>Church placement corrected September 6:</b> east of Highway 19. The grey X is the rejected source-warp prediction; the teal point uses <a href="{esc(ref["url"],quote=True)}">{esc(ref["name"])}, OpenStreetMap node {ref["id"]}</a> (version {ref["version"]}). Local review corrects the side of the road; the modern reference supplies this approximate coordinate. The native church symbol and frozen sheet transform remain unchanged. Exact historical foundations remain unresolved. <a href="{esc(ref["rights_url"],quote=True)}">© OpenStreetMap contributors, ODbL 1.0</a>.</p>')
        for ref in c['external_records']:
            content.append(f'<p><b>Separate provincial record:</b> <a href="{esc(ref["url"],quote=True)}">{esc(ref["record_id"])}</a> — {esc(ref["interpretation"])} Coordinates belong to that record; linkage to Fletcher remains a candidate.</p>')
        for ref in d.get('external_sources',[]): content.append(f'<p><a href="{ref["url"]}">Historical source</a>: {esc(ref["finding"])}</p>')
        content.append('</section>')
    content.append('<footer>Historical imagery: David Rumsey Map Collection, David Rumsey Map Center, Stanford University Libraries. <a href="https://creativecommons.org/licenses/by-nc-sa/3.0/">CC BY-NC-SA 3.0</a>; project cropping, annotation and frozen georeferencing. <a href="../INVENTORY.md">Scoped permission record</a>. Modern reference: Province of Nova Scotia NSTDB; separate provincial mining records retain source IDs and dates in the evidence data. This report establishes no current site condition, ownership or access.</footer></html>')
    (ROOT/'review.html').write_text(''.join(content))
    artifact_paths=[ROOT/'pilot.json',ROOT/'review.html',ROOT/'mapped-annotations.geojson',ROOT/'mapping-queue.json',*sorted(out.glob('*.jpg'))]
    (ROOT/'artifact-receipt.json').write_text(json.dumps({'artifacts':[{'path':str(f.relative_to(ROOT)),'sha256':digest(f),'bytes':f.stat().st_size} for f in artifact_paths]},indent=2)+'\n')
    print(f'Built {len(cases)} candidate-area reviews; no accepted historical geometry.')

if __name__ == '__main__':
    main()
