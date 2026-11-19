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

- Feature claims come from `fastlane/metadata/en-US/description.txt` and
  `docs/index.html`. Recheck them there before reusing the poster.
- `hero-then-guysborough.jpg`: Fletcher mosaic tiles (z13) for
  61.58–61.20° W, 45.455–45.546° N, from Sheet 24 (Rumsey 3997.026, 1884).
  David Rumsey Map Collection, CC BY-NC-SA 3.0. The area is chosen to avoid the
  hatched olive Carboniferous fill, which is hard to read in print.
- `hero-now-guysborough.jpg`: NS Marks Atlas Day raster tiles (z12) for the
  same extent.
- The phone shows `fastlane/screenshots/en-US/iphone-6-9-06-data-sources.png`.
- `qr-appstore.svg` opens the App Store listing; `qr-web.svg` opens
  https://kinnokilabs.com/map. Both were made with `segno`.
