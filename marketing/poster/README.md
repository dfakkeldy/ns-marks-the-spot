# Letter-size poster

`ns-marks-the-spot-poster.pdf` is a one-page, 8.5 × 11 in poster for the app and
web map. `poster.html` is its source.

## Rebuild

```bash
cd marketing/poster
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless \
  --no-pdf-header-footer --allow-file-access-from-files \
  --virtual-time-budget=10000 \
  --print-to-pdf=ns-marks-the-spot-poster.pdf "file://$PWD/poster.html"
```

The page uses system fonts (Iowan Old Style, Avenir Next), so print it on a Mac.

## Sources

- Feature claims come from `fastlane/metadata/en-US/description.txt`,
  `README.md` (Your maps: PDF, GeoTIFF, georeferencer), `web/README.md` (3D terrain) and
  `docs/index.html`. Recheck them there before reusing the poster.
- `hero-then-glendale.jpg`: Fletcher mosaic tiles (z15) for
  61.3796–61.3184° W, 45.8261–45.8391° N, from Sheet 19 (Rumsey 3997.021, 1884),
  around the gold mine the sheet marks beside Glendale Brook. David Rumsey Map
  Collection, CC BY-NC-SA 3.0. The area sits in the pink fill, away from the
  hatched olive Carboniferous fill, which is hard to read in print.
- `hero-now-glendale.jpg`: NS Marks Atlas Day raster tiles (z13, upscaled 2×)
  for the same extent.
- `qr-appstore.svg` opens the App Store listing; `qr-web.svg` opens
  https://kinnokilabs.com/map. Both were made with `segno`.
