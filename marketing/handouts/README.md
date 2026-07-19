# Nova Scotia tax-sale handout

This folder contains the source for the one-page, monochrome-friendly handout
for the NS Marks The Spot online tax-sale map and its companion guide.

The handout is separate from the GitHub Pages site under `docs/`. Generating it
does not change the app website.

## Generate

From the repository root, with ReportLab installed:

```sh
python3 marketing/handouts/generate_tax_sale_handout.py
```

The finished file is written to:

```text
output/pdf/ns-tax-sale-map-guide-handout.pdf
```

The PDF is US Letter portrait, uses only black, white, and gray, and includes a
clickable QR code and printed URL for the live map.

The handout embeds `assets/ns-tax-sale-map-view.jpg`, a 1280 by 720 capture of
the live production map with public tax-sale PID `15356793` selected. It was
captured on July 19, 2026 without using browser location. The surrounding page
uses high-contrast black, white, and gray so the design remains legible when
printed in monochrome; the actual product view is retained in colour.

The privacy strip reflects the current web source: there is no advertising,
account system, cookie use, analytics code, or republication of assessed-owner
names. The app does use browser local storage to remember Province licence
acceptance; that is intentionally not described as “no storage.”
