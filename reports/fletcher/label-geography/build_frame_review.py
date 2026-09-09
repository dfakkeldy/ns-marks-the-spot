"""Render representative native label boxes with explicit review crop frames.

Run from repository root: python reports/fletcher/label-geography/build_frame_review.py
  --sheet 19 --source /path/to/native/sheet19.png
Requires Pillow. Images are evidence excerpts, not a replacement source frame.
"""
import argparse
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from tools.fletcher.project_labels import ROOT, REPORT, read, write, digest, require

SELECTED = {
    19: [1, 6, 15, 46, 61, 62, 78, 79, 94, 130, 156, 166],
    16: [1, 42, 125, 140, 146, 147, 149, 193, 197, 200, 234, 256],
    22: [1, 4, 25, 104, 165, 181, 194, 205, 246, 261, 280, 301],
}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sheet", type=int, choices=SELECTED, required=True)
    parser.add_argument("--source", type=Path, required=True)
    args = parser.parse_args()
    data = read(ROOT / REPORT / f"sheet-{args.sheet}-labels.geojson")
    require(digest(args.source) == data["source_sha256"], "Native source mismatch")
    Image.MAX_IMAGE_PIXELS = 150_000_000
    scan = Image.open(args.source).convert("RGB")
    canvas = Image.new("RGB", (1500, 1000), "#ffffff")
    draw = ImageDraw.Draw(canvas)
    font = ImageFont.load_default(size=16)
    frames = []
    for i, number in enumerate(SELECTED[args.sheet]):
        feature = next(f for f in data["features"] if int(f["id"].split("-")[-1]) == number)
        p = feature["properties"]
        # The first box is sufficient to inspect the frame; multipart labels keep every box in GeoJSON.
        box = p["source_label_boxes_xywh"][0]
        x, y, w, h = box
        left, top = max(0, int(x)-35), max(0, int(y)-35)
        right, bottom = min(scan.width, int(x+w)+35), min(scan.height, int(y+h)+35)
        crop = scan.crop((left, top, right, bottom))
        cx, cy = p["label_anchors"][0]["source_pixel_xy"]
        ink = ImageDraw.Draw(crop)
        ink.rectangle((x-left, y-top, x+w-left, y+h-top), outline="#d900ad", width=2)
        ink.line((cx-left-6, cy-top, cx-left+6, cy-top), fill="#d900ad", width=1)
        ink.line((cx-left, cy-top-6, cx-left, cy-top+6), fill="#d900ad", width=1)
        scale = min(2, 470/crop.width, 160/crop.height)
        size = (round(crop.width*scale), round(crop.height*scale))
        tile_x, tile_y = (i % 3)*500+15, (i//3)*250+10
        draw.text((tile_x, tile_y), f"{feature['id']} | {p['source_text'].replace(chr(10), ' ')}", font=font, fill="black")
        draw.text((tile_x, tile_y+23), f"native xywh {box}", font=font, fill="black")
        canvas.paste(crop.resize(size, Image.Resampling.NEAREST), (tile_x, tile_y+52))
        draw.text((tile_x, tile_y+216), p["label_anchors"][0]["status"], font=font, fill="black")
        frames.append({"annotation_id": feature["id"], "box_index": 0,
                       "source_xywh": [left, top, right-left, bottom-top], "displayed_dimensions_px": list(size),
                       "display_offset_xy": [tile_x, tile_y+52], "rotation_degrees": 0,
                       "source_label_box_xywh": box, "source_anchor_xy": [cx, cy]})
    image_path = ROOT / REPORT / f"sheet-{args.sheet}-frame-review.jpg"
    canvas.save(image_path, quality=92)
    write(ROOT / REPORT / f"sheet-{args.sheet}-review-frames.json", {
        "source_sha256": data["source_sha256"], "fit_sha256": data["provenance"]["fit_sha256"],
        "image_sha256": digest(image_path), "frames": frames,
        "mapping": "Subtract display_offset_xy, then source_xywh origin plus display coordinate times source extent / displayed_dimensions_px. No rotation.",
        "scope": "Representative first-box frame review; native crop equality for all production packets is recorded separately.",
    })


if __name__ == "__main__":
    main()
