#!/bin/zsh
# Regenerates the spike fixtures. GDAL 3.9.0 (MacPorts) produced the committed
# copies; utm20-8x6.tif is copied from the repo's own web test fixtures.
set -euo pipefail
cd "$(dirname "$0")"
SRC=../../../web/src/test/fixtures/utm20-8x6.tif
cp "$SRC" utm20-8x6.tif

gdal_translate -mo AREA_OR_POINT=POINT "$SRC" pixelispoint-8x6.tif
gdal_translate -of GTiff -co BIGTIFF=YES "$SRC" bigtiff-8x6.tif

gdal_create -outsize 64 48 -bands 3 -burn 10 -burn 20 -burn 30 \
  -a_srs EPSG:4326 -a_ullr -63.5 45.5 -63.0 45.1 -of GTiff wgs84-64x48.tif

# A rotated geotransform cannot be expressed as scale+tiepoint, so GDAL writes
# ModelTransformation (34264) instead — the other georeferencing branch.
gdal_translate -of VRT wgs84-64x48.tif rot.vrt
/usr/bin/sed -i '' -E 's|<GeoTransform>.*</GeoTransform>|<GeoTransform>-6.35000000e+01, 6.76776695e-03, -3.90625000e-03, 4.55000000e+01, -3.90625000e-03, -6.76776695e-03</GeoTransform>|' rot.vrt
gdal_translate -of GTiff rot.vrt rotated-64x48.tif
rm -f rot.vrt

gdal_create -outsize 1024 1024 -bands 3 -burn 200 -a_srs EPSG:3857 \
  -a_ullr -7000000 5700000 -6990000 5690000 -of GTiff \
  -co TILED=YES -co COMPRESS=LZW tiled-lzw-1024.tif

# Five IFDs: base plus four reduced-resolution overviews.
gdal_create -outsize 4000 3000 -bands 3 -burn 120 -burn 90 -burn 60 \
  -a_srs EPSG:26920 -a_ullr 600000 5100000 640000 5070000 -ot Byte -of GTiff \
  -co COMPRESS=DEFLATE -co TILED=YES pyramid-4000-deflate.tif
gdaladdo -r average --config COMPRESS_OVERVIEW DEFLATE pyramid-4000-deflate.tif 2 4 8 16
