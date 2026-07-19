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
