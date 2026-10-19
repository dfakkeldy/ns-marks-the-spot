"""Build the pinned Judique CHM locally. No upload or deployment operations."""
from __future__ import annotations

import argparse
import bisect
import hashlib
import json
import math
import re
import struct
import subprocess
import sys
import tempfile
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
MANIFEST = ROOT / "web/src/layers/lidarCanopyPilot.json"
INDEX = Path(__file__).with_name("source-index.json")
DOWNLOAD_ENDPOINT = "https://nsgi.novascotia.ca/WSF_DDS/DDS.svc/DownloadFileByReference"
ARCHIVE_LIMIT = 260_000_000  # Includes the publisher's 51 MB ancillary overview.


def digest(path):
    h = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def height_class(value, minima):
    """Class lower bounds are inclusive. Invalid/negative is not zero height."""
    return bisect.bisect_right(minima, value) - 1 if math.isfinite(value) and value >= 0 else None


def copy_bounded(source, dest, limit):
    total = 0
    while block := source.read(1024 * 1024):
        total += len(block)
        if total > limit:
            raise ValueError("Download exceeded the pilot storage cap")
        dest.write(block)
    return total


def extract_raster(archive, directory, sheet):
    """Extract exactly the pinned TIFF, never arbitrary archive paths."""
    target = directory / sheet["filename"]
    if target.exists():
        raise FileExistsError(target.name)
    partial = target.with_suffix(".partial")
    if partial.exists():
        raise FileExistsError(partial.name)
    try:
        with zipfile.ZipFile(archive) as z:
            entry = z.getinfo(sheet["filename"])
            if entry.file_size != sheet["rasterBytes"]:
                raise ValueError("Unexpected source raster size")
            with z.open(entry) as source, partial.open("xb") as dest:
                copy_bounded(source, dest, sheet["rasterBytes"])
        if digest(partial) != sheet["sha256"]:
            raise ValueError("Source raster hash differs from the reviewed pilot")
        partial.rename(target)
    finally:
        partial.unlink(missing_ok=True)


def download(sheet, directory):
    directory.mkdir(parents=True, exist_ok=True)
    if (directory / sheet["filename"]).exists():
        return  # The build validates the existing hash before using it.
    # Resolve the public Explorer's current DDS key at runtime. Never persist
    # it or log a keyed request URL. No account or credential setup is needed.
    with urllib.request.urlopen("https://nsgi.novascotia.ca/datalocator/elevation/js/config/config.js", timeout=60) as response:
        config = response.read().decode()
    key = re.search(r'"DDS_ServiceOptions"[^\n]+Key: "([^"]+)"', config)
    dataset = re.search(r'const DDS_DatasetIDs_CHM_PROD\s*=\s*"(\d+)"', config)
    if not key or not dataset or dataset[1] != "98":
        raise ValueError("Explorer download configuration changed; review before downloading")
    query = urllib.parse.urlencode({"tkey": key[1], "DATASET_ID": dataset[1], "REF_ID": f'{sheet["sheet"]}_{sheet["project"]}'})
    # The public service ignores HEAD and Range. Bound the streamed ZIP and
    # extract only the TIFF, leaving the publisher's ancillary .ovr unused.
    with tempfile.TemporaryDirectory(prefix="chm-download-", dir=directory) as temp:
        archive = Path(temp) / "source.zip"
        try:
            with urllib.request.urlopen(DOWNLOAD_ENDPOINT + "?" + query, timeout=90) as response, archive.open("xb") as dest:
                copy_bounded(response, dest, ARCHIVE_LIMIT)
        except Exception:
            raise RuntimeError("CHM download failed; retry or use the official Elevation Explorer") from None
        extract_raster(archive, directory, sheet)


def build(args, pilot):
    import numpy as np
    from osgeo import gdal

    gdal.UseExceptions()
    sheet, = pilot["sheets"]
    source_path = args.input_dir / sheet["filename"]
    if digest(source_path) != sheet["sha256"]:
        raise ValueError("Source raster hash differs from the reviewed pilot")
    if args.out.name != pilot["revision"] or ROOT == args.out or ROOT in args.out.parents:
        raise ValueError("Output must be a new revision directory outside the repository")
    if args.out.exists():
        raise FileExistsError("Output revision already exists; use a new empty location")
    source = gdal.Open(str(source_path))
    band = source.GetRasterBand(1)
    transform = source.GetGeoTransform()
    srs = source.GetSpatialRef()
    if (source.RasterCount != 1 or band.DataType != gdal.GDT_Float32 or
            (transform[1], transform[2], transform[4], transform[5]) != (1.0, 0.0, 0.0, -1.0) or
            srs.GetUTMZone() != 20 or "CSRS" not in srs.GetAttrValue("GEOGCS") or
            band.GetUnitType() != "metre"):
        raise ValueError("Expected a 1 m Float32 NAD83(CSRS) UTM 20N height raster in metres")
    args.out.mkdir(parents=True)
    minima = [item["minimum"] for item in pilot["classes"]]
    palette = np.array([tuple(bytes.fromhex(item["color"][1:])) + (255,) for item in pilot["classes"]], dtype=np.uint8)
    counts = np.zeros(len(minima), dtype=np.int64)
    invalid_count = negative_count = zero_count = 0
    values_hash = hashlib.sha256()
    width, height = source.RasterXSize, source.RasterYSize
    nodata = band.GetNoDataValue()
    with tempfile.TemporaryDirectory(prefix="chm-build-", dir=args.out.parent) as temp:
        work = Path(temp)
        coloured_path = work / "classes.tif"
        coloured = gdal.GetDriverByName("GTiff").Create(str(coloured_path), width, height, 4, gdal.GDT_Byte,
            options=["TILED=YES", "COMPRESS=DEFLATE", "BIGTIFF=IF_SAFER"])
        coloured.SetGeoTransform(transform)
        coloured.SetProjection(source.GetProjection())
        for i, interpretation in enumerate([gdal.GCI_RedBand, gdal.GCI_GreenBand, gdal.GCI_BlueBand, gdal.GCI_AlphaBand], 1):
            coloured.GetRasterBand(i).SetColorInterpretation(interpretation)
        for y in range(0, height, 256):
            rows = min(256, height - y)
            values = band.ReadAsArray(0, y, width, rows)
            values_hash.update(values.tobytes())
            measured = (band.GetMaskBand().ReadAsArray(0, y, width, rows) != 0) & np.isfinite(values)
            negative_count += int(np.count_nonzero(measured & (values < 0)))
            valid = measured & (values >= 0)
            invalid_count += int(np.count_nonzero(~valid))
            zero_count += int(np.count_nonzero(valid & (values == 0)))
            indices = np.searchsorted(minima, values, side="right") - 1
            indices[~valid] = 0
            rgba = palette[indices]
            rgba[~valid] = 0
            counts += np.bincount(indices[valid], minlength=len(minima))
            for i in range(4):
                coloured.GetRasterBand(i + 1).WriteArray(rgba[:, :, i], 0, y)
        coloured = None
        # A VRT supplies the projected coverage receipt. Tile the original
        # UTM colour raster directly with Fletcher's current GDAL command,
        # avoiding legacy gdal2tiles' rounded intermediate read windows.
        warped_path = work / "web-mercator.vrt"
        warped = gdal.Warp(str(warped_path), str(coloured_path), format="VRT", dstSRS="EPSG:3857",
            resampleAlg="near", srcAlpha=True, dstAlpha=True, errorThreshold=0)
        gt = warped.GetGeoTransform()
        def lon(x): return math.degrees(x / 6378137)
        def lat(y): return math.degrees(math.atan(math.sinh(y / 6378137)))
        bounds = [lon(gt[0]), lat(gt[3] + warped.RasterYSize * gt[5]), lon(gt[0] + warped.RasterXSize * gt[1]), lat(gt[3])]
        warped = None
        known = pilot["bounds"]
        if not (known["west"] <= bounds[0] < bounds[2] <= known["east"] and known["south"] <= bounds[1] < bounds[3] <= known["north"]):
            raise ValueError("Raster is outside the reviewed pilot bounds")
        subprocess.run([args.gdal, "raster", "tile", f'--min-zoom={pilot["minZoom"]}', f'--max-zoom={pilot["maxNativeZoom"]}',
            "--convention=xyz", "--resampling=nearest", "--overview-resampling=nearest", "--webviewer=none", "--num-threads=2",
            str(coloured_path), str(args.out)], check=True)
    inventory = []
    zoom_counts = {}
    for path in sorted(args.out.glob("*/*/*.png")):
        z, x, y = map(int, [*path.relative_to(args.out).parts[:2], path.stem])
        if not (pilot["minZoom"] <= z <= pilot["maxNativeZoom"] and 0 <= x < 2 ** z and 0 <= y < 2 ** z):
            raise ValueError("Invalid XYZ coordinates")
        with path.open("rb") as stream:
            header = stream.read(24)
        if header[:8] != b"\x89PNG\r\n\x1a\n" or struct.unpack(">II", header[16:24]) != (256, 256):
            raise ValueError("Invalid tile dimensions")
        inventory.append({"path": path.relative_to(args.out).as_posix(), "bytes": path.stat().st_size, "sha256": digest(path)})
        zoom_counts[z] = zoom_counts.get(z, 0) + 1
    if set(zoom_counts) != set(range(pilot["minZoom"], pilot["maxNativeZoom"] + 1)):
        raise ValueError("Incomplete tile pyramid")
    inventory_path = args.out / "tile-inventory.json"
    inventory_path.write_text(json.dumps(inventory, indent=2) + "\n")
    cog_receipt = None
    if args.cog:
        cog_path = args.out / "judique-2017-chm.cog.tif"
        gdal.Translate(str(cog_path), source, format="COG", creationOptions=["COMPRESS=DEFLATE", "PREDICTOR=FLOATING_POINT", "OVERVIEW_RESAMPLING=NEAREST"])
        cog = gdal.Open(str(cog_path))
        if cog.GetMetadata("IMAGE_STRUCTURE").get("LAYOUT") != "COG" or cog.GetGeoTransform() != transform:
            raise ValueError("COG layout or geography changed")
        check_hash = hashlib.sha256()
        for y in range(0, height, 256):
            check_hash.update(cog.GetRasterBand(1).ReadAsArray(0, y, width, min(256, height-y)).tobytes())
        if check_hash.hexdigest() != values_hash.hexdigest() or cog.GetRasterBand(1).GetNoDataValue() != nodata:
            raise ValueError("COG did not preserve every source height and NoData value")
        cog = None
        cog_receipt = {"file": cog_path.name, "bytes": cog_path.stat().st_size, "sha256": digest(cog_path), "layout": "COG", "pixelValuesIdentical": True}
    receipt = {
        "revision": pilot["revision"], "name": pilot["name"], "status": "local-preview",
        "publication": "withheld-pending-licence-confirmation-and-owner-approval",
        "scheme": "xyz", "format": "png", "tileSize": 256,
        "minzoom": pilot["minZoom"], "maxzoom": pilot["maxNativeZoom"], "bounds": bounds,
        "source": {**sheet, "dimensions": [width, height], "geoTransform": list(transform), "projectionWkt": source.GetProjection(), "noData": nodata,
            "downloadEndpoint": DOWNLOAD_ENDPOINT, "datasetId": 98, "referenceId": f'{sheet["sheet"]}_{sheet["project"]}'},
        "sourceIndexSha256": digest(INDEX), "manifestSha256": digest(MANIFEST), "builderSha256": digest(__file__),
        "licence": pilot["licenceUrl"], "licenceStatus": pilot["licenceStatus"], "attribution": pilot["attribution"],
        "classes": [{**item, "sourcePixels": int(count)} for item, count in zip(pilot["classes"], counts)],
        "transparentPixels": invalid_count, "negativeHeightPixels": negative_count, "zeroHeightPixels": zero_count,
        "sourcePixelValuesSha256": values_hash.hexdigest(), "resampling": "nearest for projection, native tiles and overviews; no class averaging",
        "tileCount": len(inventory), "tileBytes": sum(item["bytes"] for item in inventory), "tileCountsByZoom": zoom_counts,
        "inventorySha256": digest(inventory_path), "gdalVersion": gdal.VersionInfo("--version"),
        "tileGdalVersion": subprocess.check_output([args.gdal, "--version"], text=True).strip(), "cog": cog_receipt,
        "caveat": "2017 heights from the Province's 2016–2020 collection. Not a timber cruise or current inspection. Transparent NoData is not zero height."
    }
    (args.out / "source.json").write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps({"revision": pilot["revision"], "tiles": len(inventory), "tileBytes": receipt["tileBytes"], "cog": cog_receipt}, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-dir", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True, help="New revision directory outside the repository")
    parser.add_argument("--download", action="store_true", help="Download the one pinned sheet from the official Explorer DDS endpoint")
    parser.add_argument("--gdal", default="gdal", help="GDAL 3.11+ CLI, matching the existing Fletcher tile pipeline")
    parser.add_argument("--cog", action="store_true", help="Also preserve the unclassified Float32 heights in a local COG")
    args = parser.parse_args()
    args.out = args.out.resolve()
    pilot = json.loads(MANIFEST.read_text())
    if args.download:
        for sheet in pilot["sheets"]:
            download(sheet, args.input_dir)
    build(args, pilot)


if __name__ == "__main__":
    main()
