#!/usr/bin/env python3
"""Reproduce the DP ME 486 display PNG with GDAL Python bindings and NumPy.

Usage: python3 scripts/generateRadonPotential.py [--archive /path/dp486v1sh.ZIP]
The pinned source archive is downloaded when --archive is omitted. The bundled
self-extracting EXE is read as a ZIP archive; it is never executed. No source
classes are inferred, dissolved, smoothed, or relabelled.
"""
from osgeo import gdal, ogr, osr
import numpy as np, json, hashlib, pathlib, argparse, tempfile, urllib.request, zipfile

gdal.UseExceptions()
ogr.UseExceptions()
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--archive", type=pathlib.Path)
args = parser.parse_args()
workspace = tempfile.TemporaryDirectory(prefix="ns-radon-")
work = pathlib.Path(workspace.name)
archive = args.archive or work / "dp486v1sh.ZIP"
if not args.archive:
    urllib.request.urlretrieve(
        "https://novascotia.ca/natr/meb/data/exe/dp486v1sh.ZIP", archive
    )
if (
    hashlib.sha256(archive.read_bytes()).hexdigest()
    != "ea9e79c7da0a44755262fadb40eacfdd819a35723bd52b26a136b2b754c7d0de"
):
    raise ValueError(
        "Source archive changed: review source, classification and licence before repinning."
    )
with zipfile.ZipFile(archive) as outer:
    nested = work / "dp486v1sh.exe"
    nested.write_bytes(outer.read("dp486v1sh.exe"))
root = work / "extracted"
with zipfile.ZipFile(nested) as inner:
    inner.extractall(root)
    raster = root / "z486ns/tif/z486nsrz_radon_potential.tif"
    vector = root / "z486ns/shp/z486nsrz_radon_potential_py_3_class.shp"
vs = ogr.Open(str(vector))
layer = vs.GetLayer()
lookup = {}
counts = {}
for f in layer:
    code = int(f["GRIDCODE"])
    rank = f["rank"]
    assert code not in lookup or lookup[code] == rank
    lookup[code] = rank
    counts[rank] = counts.get(rank, 0) + 1
src = gdal.Open(str(raster))
arr = src.ReadAsArray()
assert set(np.unique(arr)) - {65535} == set(lookup)
classes = {"Water Feature/No Data": 1, "Low": 2, "Medium": 3, "High": 4}
out = np.zeros(arr.shape, dtype=np.uint8)
for code, rank in lookup.items():
    out[arr == code] = classes[rank]
mem = gdal.GetDriverByName("MEM").Create(
    "", src.RasterXSize, src.RasterYSize, 1, gdal.GDT_Byte
)
mem.SetGeoTransform(src.GetGeoTransform())
mem.SetProjection(src.GetProjection())
mem.GetRasterBand(1).WriteArray(out)
mem.GetRasterBand(1).SetNoDataValue(0)
warped = gdal.Warp(
    "",
    mem,
    format="MEM",
    dstSRS="EPSG:3857",
    resampleAlg="near",
    errorThreshold=0,
    xRes=350,
    yRes=350,
    srcNodata=0,
    dstNodata=0,
)
colors = {
    0: (0, 0, 0, 0),
    1: (204, 204, 204, 255),
    2: (247, 195, 72, 255),
    3: (196, 109, 27, 255),
    4: (107, 6, 1, 255),
}
ct = gdal.ColorTable()
[ct.SetColorEntry(k, v) for k, v in colors.items()]
warped.GetRasterBand(1).SetRasterColorTable(ct)
warped.GetRasterBand(1).SetRasterColorInterpretation(gdal.GCI_PaletteIndex)
outdir = pathlib.Path(__file__).resolve().parents[1] / "public/data"
outdir.mkdir(exist_ok=True)
png = outdir / "radon-potential.png"
gdal.Translate(str(png), warped, format="PNG", creationOptions=["ZLEVEL=9"])
# PNG retains georeferencing through the receipt; avoid generated auxiliary sidecars.
for p in outdir.glob("radon-potential.png.aux.xml"):
    p.unlink()
gt = warped.GetGeoTransform()
west, north = gt[0], gt[3]
east = west + warped.RasterXSize * gt[1]
south = north + warped.RasterYSize * gt[5]
a = osr.SpatialReference()
a.ImportFromEPSG(3857)
a.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
b = osr.SpatialReference()
b.ImportFromEPSG(4326)
b.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
t = osr.CoordinateTransformation(a, b)
sw = t.TransformPoint(west, south)
ne = t.TransformPoint(east, north)
# Independently project output pixel centres back into source raster; nearest neighbour must agree.
back = osr.SpatialReference()
back.ImportFromWkt(src.GetProjection())
back.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
tr = osr.CoordinateTransformation(a, back)
actual = warped.ReadAsArray()
sg = src.GetGeoTransform()
checked = 0
for iy in range(5, warped.RasterYSize, 17):
    for ix in range(5, warped.RasterXSize, 17):
        x, y, _ = tr.TransformPoint(west + (ix + 0.5) * 350, north - (iy + 0.5) * 350)
        sx = int(np.floor((x - sg[0]) / 250))
        sy = int(np.floor((sg[3] - y) / 250))
        expected = (
            out[sy, sx]
            if 0 <= sx < src.RasterXSize and 0 <= sy < src.RasterYSize
            else 0
        )
        if actual[iy, ix] != expected:
            raise ValueError((ix, iy, actual[iy, ix], expected))
        checked += 1
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
receipt = {
    "product": "DP ME 486, Version 1, 2013: Potential for Radon in Indoor Air in Nova Scotia",
    "sourceUrl": "https://data.novascotia.ca/d/tk49-rtq2",
    "downloadUrl": "https://novascotia.ca/natr/meb/data/exe/dp486v1sh.ZIP",
    "licenceUrl": "https://novascotia.ca/opendata/licence.asp",
    "sourceLicenceEvidence": "Socrata api/views/tk49-rtq2.json licenseId OGL_NOVA_SCOTIA, verified 2026-09-07",
    "attribution": "Contains information licensed under the Open Government Licence – Nova Scotia.",
    "retrieved": "2026-09-07",
    "archiveBytes": archive.stat().st_size,
    "archiveSha256": sha(archive),
    "sourceRasterPath": str(raster.relative_to(root)),
    "sourceRasterSha256": sha(raster),
    "sourceRasterCellSizeMetres": 250,
    "sourceRasterDimensions": [src.RasterXSize, src.RasterYSize],
    "sourcePolygonCount": sum(counts.values()),
    "sourcePolygonClassCounts": counts,
    "classification": "Exact GRIDCODE to rank mapping taken from the accompanying source shapefile; every source raster score verified present in mapping. No thresholds invented.",
    "scoreToClass": lookup,
    "colours": {str(k): v for k, v in colors.items()},
    "transformation": "GDAL "
    + gdal.VersionInfo("--version")
    + "; exact source categories reprojected EPSG:2961 to EPSG:3857 using nearest neighbour at 350 projected metres per pixel. No smoothing, gap filling, interpolation of hazard classes, or new observations.",
    "imageBounds": [[sw[1], sw[0]], [ne[1], ne[0]]],
    "imageDimensions": [warped.RasterXSize, warped.RasterYSize],
    "outputProjectedBounds": [west, south, east, north],
    "outputBytes": png.stat().st_size,
    "outputSha256": sha(png),
    "validation": {
        "independentlyReprojectedPixelCentres": checked,
        "mismatches": 0,
        "outputCategories": list(map(int, np.unique(actual))),
        "sourceNoDataTransparent": True,
        "waterFeatureNoDataColour": "#cccccc",
    },
    "limitations": "Regional potential map, 2013; native raster cell size 250 m. Magnification adds no local accuracy. Only a radon test can determine indoor conditions. Water Feature/No Data is grey; outside source coverage is transparent.",
}
(outdir / "radon-potential.source.json").write_text(
    json.dumps(receipt, indent=2) + "\n"
)
print(
    json.dumps(
        {
            k: receipt[k]
            for k in ["imageBounds", "imageDimensions", "outputBytes", "validation"]
        }
    )
)
