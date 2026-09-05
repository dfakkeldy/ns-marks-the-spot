"""Render original source coordinates and raw predictions; never adjust predictions."""

import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ap = argparse.ArgumentParser(description=__doc__)
ap.add_argument("--packets", type=Path, required=True)
ap.add_argument("--scores", type=Path, required=True)
ap.add_argument("--out", type=Path, required=True)
args = ap.parse_args()
args.out.mkdir(parents=True, exist_ok=True)
scores = json.loads(args.scores.read_text())
rows = scores["points"]
font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 23)
small = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 17)
big = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 30)
for start in range(0, len(rows), 4):
    canvas = Image.new("RGB", (1700, 2050), "white")
    d = ImageDraw.Draw(canvas)
    d.text(
        (35, 15),
        "DeepSeek Judique correspondence trial — raw predictions",
        font=big,
        fill="#172430",
    )
    d.text(
        (35, 57),
        "Historical: red cross = DeepSeek; green ring = reviewed point. Modern: red ring = target.",
        font=small,
        fill="#333333",
    )
    for index, row in enumerate(rows[start : start + 4]):
        top = 105 + index * 465
        cid = row["case_id"]
        error = row["source_error_px"]
        label = f"{cid} · {row['target_id']} · {'positive' if row['positive'] else 'mismatched pair'} · {row['status']}"
        if error is not None:
            label += f" · {error:.1f} source px"
        d.text((35, top), label, font=font, fill="#172430")
        raw = Image.open(args.packets / cid / "historical.png").convert("RGB")
        grid = Image.open(args.packets / cid / "historical-grid.png").convert("RGB")
        modern = Image.open(args.packets / cid / "modern.png").convert("RGB")
        for im in [raw, grid]:
            q = ImageDraw.Draw(im)
            if row["positive"]:
                x, y = row["expected_local_xy"]
                q.ellipse((x - 12, y - 12, x + 12, y + 12), outline="#00ed50", width=4)
            if row["predicted_local_xy"]:
                x, y = row["predicted_local_xy"]
                q.line((x - 14, y, x + 14, y), fill="#ed1235", width=4)
                q.line((x, y - 14, x, y + 14), fill="#ed1235", width=4)
        for column, im in enumerate([raw, grid, modern]):
            canvas.paste(
                im.resize((400, 400), Image.Resampling.LANCZOS),
                (35 + column * 445, top + 38),
            )
        d.text((1390, top + 50), "Reference in detail", font=small, fill="#333333")
        d.text(
            (1390, top + 80), str(row["expected_local_xy"]), font=small, fill="#008537"
        )
        d.text((1390, top + 120), "DeepSeek coordinate", font=small, fill="#333333")
        d.text(
            (1390, top + 150),
            str(row["predicted_local_xy"]),
            font=small,
            fill="#c20a29",
        )
    d.text(
        (35, 1980),
        "Review evidence only; no production changes. Project reference points are not surveyed truth.",
        font=small,
        fill="#333333",
    )
    d.text(
        (35, 2010),
        "Historical scan: David Rumsey Map Collection / Stanford · CC BY-NC-SA 3.0 · Modern: NSTDB water / roads",
        font=small,
        fill="#333333",
    )
    canvas.save(args.out / f"review-{start // 4 + 1}.png")
print("Wrote", len(range(0, len(rows), 4)), "review pages")
