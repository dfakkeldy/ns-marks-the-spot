# NS Marks The Spot print handouts

This folder contains the source for two monochrome-friendly handouts:

- a two-page, duplex-ready introduction to the general Nova Scotia land and
  field map, followed by the tax-sale map and companion guide; and
- the original one-page tax-sale map and guide handout for standalone use.

The handouts are separate from the GitHub Pages site under `docs/`. Generating
them does not change the app website or application.

## Generate

From the repository root, with ReportLab installed:

```sh
python3 marketing/handouts/generate_tax_sale_handout.py
```

The finished files are written to:

```text
output/pdf/ns-marks-the-spot-duplex-handout.pdf
output/pdf/ns-tax-sale-map-guide-handout.pdf
```

Both PDFs are US Letter portrait and include a clickable QR code and printed URL
for the live map. The duplex PDF is ordered front then back:

1. general land-research and field-planning map;
2. tax-sale map and book/audiobook/video guide.

The surrounding design uses black, white, and gray. Actual product captures are
retained in colour and checked in grayscale so they remain useful when printed
in monochrome.

The duplex front embeds `assets/ns-field-map-view.jpg`, a 1280 by 720 production
capture showing civic-address/PID search, NS Property Boundaries, Crown Lands,
water features, and roads/trails/culverts. Its back and the standalone handout
embed `assets/ns-tax-sale-map-view.jpg`, a 1280 by 720 production capture with
public tax-sale PID `15356793` selected. Both were captured on July 19, 2026
without using browser location.

The privacy strip reflects the current web source: there is no advertising,
account system, cookie use, analytics code, or republication of assessed-owner
names. The app does use browser local storage to remember Province licence
acceptance; that is intentionally not described as "no storage."
