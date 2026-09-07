#!/usr/bin/env bash
#
# Publish a rendered NS Marks Atlas raster revision to the tile host and verify
# it landed. The counterpart of the Fletcher publisher, for the package that
# web/scripts/atlasRaster/buildAtlasRaster.mjs writes:
#
#   <PACKAGE_ROOT>/<REVISION>/source.json
#   <PACKAGE_ROOT>/<REVISION>/coverage.json
#   <PACKAGE_ROOT>/<REVISION>/<style>/{z}/{x}/{y}.webp
#   <PACKAGE_ROOT>/<REVISION>/<style>/ocean/{z}.webp
#
# It uploads to <bucket>/atlas-raster/<REVISION>/, which the public host serves
# as https://tiles.kinnokilabs.com/atlas-raster/<REVISION>/…, the prefix the
# native app reads (AtlasRasterTileURL). Nothing here changes the app's pinned
# revision: that is a source change, made only after this script has verified
# the objects and a build has been seen drawing them.
#
# The canary write comes first for the reason the Fletcher script gives: an
# API token without write scope fails on the first object rather than after
# hours of silent 403s.
#
# Usage:
#   export R2_ACCOUNT_ID=...            # Cloudflare account id (R2 dashboard)
#   export AWS_ACCESS_KEY_ID=...        # R2 API token — Object Read & Write
#   export AWS_SECRET_ACCESS_KEY=...    #   on the tile bucket
#   tools/publish-atlas-raster.sh REVISION PACKAGE_ROOT [AWS_CLI]
#
# Resumable: aws s3 sync skips objects already present at the same size.

set -euo pipefail

REVISION="${1:?REVISION (for example atlas-raster-20260907.1)}"
PACKAGE_ROOT="${2:?PACKAGE_ROOT (the --out directory of the render)}"
AWS="${3:-aws}"
BUCKET="${ATLAS_RASTER_BUCKET:-ns-marks-fletcher-tiles}"
PUBLIC_HOST="${ATLAS_RASTER_PUBLIC_HOST:-https://tiles.kinnokilabs.com}"
PREFIX="atlas-raster"

SRC="$PACKAGE_ROOT/$REVISION"
LOG="${ATLAS_RASTER_LOG:-$HOME/atlas-raster-upload-$(date +%Y%m%d-%H%M%S).log}"

: "${R2_ACCOUNT_ID:?set R2_ACCOUNT_ID}"
: "${AWS_ACCESS_KEY_ID:?set AWS_ACCESS_KEY_ID}"
: "${AWS_SECRET_ACCESS_KEY:?set AWS_SECRET_ACCESS_KEY}"

export AWS_DEFAULT_REGION=auto
ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
S3=("$AWS" --endpoint-url "$ENDPOINT")

say() { printf '\n=== %s ===\n' "$*"; }
json() { python3 -c "import json,sys;d=json.load(open('$SRC/source.json'));print($1)"; }

# ---------------------------------------------------------------- preflight --
say "Preflight"
command -v "$AWS" >/dev/null || { echo "aws CLI not found: $AWS"; exit 1; }
[ -d "$SRC" ] || { echo "package missing at $SRC"; exit 1; }
[ -r "$SRC/source.json" ] || { echo "cannot read $SRC/source.json"; exit 1; }
[ -r "$SRC/coverage.json" ] || { echo "cannot read $SRC/coverage.json"; exit 1; }

receipt_rev=$(json "d['revision']")
if [ "$receipt_rev" != "$REVISION" ]; then
  echo "receipt says revision '$receipt_rev' but uploading as '$REVISION' — refusing"
  exit 1
fi
receipt_total=$(json "d['tiles']['total']")
receipt_zooms=$(json "'-'.join(map(str,d['zoomRange']))")
if [ "$receipt_zooms" != "5-13" ]; then
  echo "receipt covers zooms $receipt_zooms; a published revision must cover 5-13 — refusing"
  exit 1
fi

expected_objects=$(find "$SRC" -type f | wc -l | tr -d ' ')
expected_bytes=$(find "$SRC" -type f -exec stat -f %z {} + 2>/dev/null | awk '{t+=$1} END {print t}')
[ -n "$expected_bytes" ] || expected_bytes=$(find "$SRC" -type f -printf '%s\n' | awk '{t+=$1} END {print t}')

echo "revision : $REVISION"
echo "package  : $SRC"
echo "objects  : $expected_objects  (receipt counts $receipt_total tiles + two json files)"
echo "bytes    : $expected_bytes"
echo "target   : s3://$BUCKET/$PREFIX/$REVISION/"
echo "log      : $LOG"

# ----------------------------------------------------------------- canary ----
say "Canary write (source.json)"
if ! "${S3[@]}" s3 cp "$SRC/source.json" "s3://$BUCKET/$PREFIX/$REVISION/source.json" \
      --content-type application/json \
      --cache-control "public, max-age=31536000, immutable" 2>&1 | tee -a "$LOG"; then
  echo "CANARY FAILED — nothing else was attempted. A 403 here is a token without Object Read & Write." >&2
  exit 1
fi
echo "Canary OK — token can write to the bucket."

# ------------------------------------------------------------------- sync ----
say "Uploading $expected_objects objects"
echo "Safe to interrupt and rerun; sync skips what is already there."
"${S3[@]}" s3 sync "$SRC" "s3://$BUCKET/$PREFIX/$REVISION/" \
  --cache-control "public, max-age=31536000, immutable" \
  --content-type image/webp --exclude "*.json" \
  --only-show-errors 2>&1 | tee -a "$LOG"
"${S3[@]}" s3 sync "$SRC" "s3://$BUCKET/$PREFIX/$REVISION/" \
  --cache-control "public, max-age=31536000, immutable" \
  --content-type application/json --exclude "*" --include "*.json" \
  --only-show-errors 2>&1 | tee -a "$LOG"

# ----------------------------------------------------------------- verify ----
say "Verifying object count and size in the bucket"
summary=$("${S3[@]}" s3 ls "s3://$BUCKET/$PREFIX/$REVISION/" --recursive --summarize \
          | tail -3 | tee -a "$LOG")
actual_objects=$(printf '%s\n' "$summary" | awk -F': *' '/Total Objects/ {print $2}')
actual_bytes=$(printf '%s\n' "$summary" | awk -F': *' '/Total Size/ {print $2}')
echo "expected: $expected_objects objects / $expected_bytes bytes"
echo "actual  : $actual_objects objects / $actual_bytes bytes"
ok=1
[ "$actual_objects" = "$expected_objects" ] || { echo "OBJECT COUNT MISMATCH"; ok=0; }
[ "$actual_bytes" = "$expected_bytes" ]     || { echo "BYTE TOTAL MISMATCH"; ok=0; }

say "Verifying delivery through the public host"
base="$PUBLIC_HOST/$PREFIX/$REVISION"
for object in source.json coverage.json fletcher/ocean/13.webp day/ocean/5.webp; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$base/$object")
  echo "$object -> HTTP $code"
  [ "$code" = "200" ] || ok=0
done
# A real tile over Judique in every style, so a half-uploaded tree cannot pass.
for style in day night fletcher; do
  tmp=$(mktemp)
  code=$(curl -s -o "$tmp" -w '%{http_code}' "$base/$style/13/2696/2918.webp")
  size=$(stat -f %z "$tmp" 2>/dev/null || stat -c %s "$tmp")
  echo "$style/13/2696/2918.webp -> HTTP $code, $size bytes"
  [ "$code" = "200" ] && [ "$size" -gt 1000 ] || ok=0
  rm -f "$tmp"
done

if [ "$ok" = 1 ]; then
  say "Published and verified: $base"
  echo "Next: point a build at it (the app pins AtlasRaster.tileRevision), see it draw, then merge."
else
  say "NOT verified — do not change the app's pinned revision"
  exit 1
fi
