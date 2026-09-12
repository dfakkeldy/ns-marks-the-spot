"""Draw source associations from their stored native coordinates, never display guesses."""
import argparse
import json
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from tools.fletcher.project_labels import ROOT, read, write, digest, require


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sheet', type=int, required=True)
    parser.add_argument('--source', type=Path, required=True)
    args = parser.parse_args()
    directory = ROOT / 'reports/fletcher/feature-geography'
    review = read(directory / f'sheet-{args.sheet}-source-review.json')
    inventory = read(ROOT / f'docs/fletcher/label-extraction/highway19-production/sheet-{args.sheet}-reviewed.json')
    require(digest(args.source) == review['source_sha256'] == inventory['source_sha256'], 'Source identity mismatch')
    Image.MAX_IMAGE_PIXELS = 150_000_000
    scan = Image.open(args.source).convert('RGB')
    require(list(scan.size) == review['source_dimensions_px'], 'Source frame mismatch')
    font = ImageFont.load_default(size=17)
    for batch in dict.fromkeys(a['review_batch'] for a in review['associations']):
        rows = [a for a in review['associations'] if a['review_batch'] == batch]
        canvas = Image.new('RGB', (1320, 530 * ((len(rows)+1)//2)), 'white')
        draw = ImageDraw.Draw(canvas)
        frames = []
        for i, row in enumerate(rows):
            annotation = next(a for a in inventory['annotations'] if a['id'] == row['annotation_id'])
            x,y,w,h = annotation['source_label_boxes_xywh'][0]
            left = max(0, min(scan.width-660, int(x+w/2-330)))
            top = max(0, min(scan.height-450, int(y+h/2-225)))
            crop = scan.crop((left,top,left+660,top+450))
            ink = ImageDraw.Draw(crop)
            point = row['source_anchor_xy']
            if point:
                cx,cy = point[0]-left,point[1]-top
                ink.ellipse((cx-12,cy-12,cx+12,cy+12),outline='#d900ad',width=2)
                for dx,dy in [(1,0),(-1,0),(0,1),(0,-1)]:
                    ink.line((cx+dx*4,cy+dy*4,cx+dx*18,cy+dy*18),fill='#d900ad',width=1)
            for x,y,w,h in row['candidate_symbol_regions_xywh']:
                ink.rectangle((x-left,y-top,x+w-left,y+h-top),outline='#d900ad',width=2)
            if row.get('source_path_xy'):
                ink.line([(x-left,y-top) for x,y in row['source_path_xy']],fill='#d900ad',width=2)
            dx,dy = (i%2)*660,(i//2)*530
            draw.text((dx+8,dy+5),f"{row['annotation_id']} {annotation['source_text'].replace(chr(10),' ')}",font=font,fill='black')
            draw.text((dx+8,dy+30),f'Native crop ({left},{top},660,450), display 1:1',font=font,fill='black')
            canvas.paste(crop,(dx,dy+60))
            frames.append({'annotation_id':row['annotation_id'],'native_xywh':[left,top,660,450],'display_xy':[dx,dy+60],'display_size':[660,450],'rotation_degrees':0,'source_anchor_xy':point,'source_group_xywh':row['candidate_symbol_regions_xywh']})
            if row.get('source_path_xy'):
                frames[-1]['source_path_xy'] = row['source_path_xy']
        image = directory / f'{batch}.jpg'
        canvas.save(image,quality=94)
        write(directory / f'{batch}-frames.json',{'source_sha256':review['source_sha256'],'source_review_sha256':digest(directory/f'sheet-{args.sheet}-source-review.json'),'image_sha256':digest(image),'frames':frames,'scope':'Source-mark crosshair/group review, not geographic validation. Original scans remain unchanged.'})

if __name__ == '__main__':
    main()
