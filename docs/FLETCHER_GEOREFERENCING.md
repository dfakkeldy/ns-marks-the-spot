# Georeferencing the Hugh Fletcher Map Collection

The Hugh Fletcher geological and topographic maps of Nova Scotia (primarily published in the late 19th century) are a valuable historical record. Since georeferencing a large collection of map sheets is a time-consuming task, this guide outlines the two most efficient paths: **leveraging pre-existing work** and **automating/optimizing your own georeferencing pipeline**.

---

## Path 1: Check for Pre-Georeferenced Map Tiles (Recommended)

Before manually georeferencing sheets, verify if they have already been georeferenced by the community or the David Rumsey Map Collection.

1. **David Rumsey Georeferencer:**
   - Search the [David Rumsey Map Collection](https://www.davidrumsey.com) for "Hugh Fletcher Nova Scotia".
   - Open a map sheet and check if the **Georeferencer** tab or the **View in GIS / Web Carography** option is available.
   - If a sheet has been georeferenced, you can copy its **WMTS/XYZ URL** directly. It will look similar to:
     `https://maps.georeferencer.com/maps/t/<id>/z/x/y.png`
   - You can add these URLs directly into `AppContainer.swift` as `.tile(...)` layers, avoiding download and manual georeferencing altogether.

---

## Path 2: Automated Georeferencing via Python & GDAL (For Grid-Based Series)

Because the Fletcher collection sheets are published on a systematic grid (rectangular latitude/longitude boundaries), you can automate the generation of Ground Control Points (GCPs) instead of clicking coordinates manually.

### Workflow Concept
1. Get the boundary coordinates (latitude/longitude) of the map sheet from its index or legend.
2. Map the 4 corner pixels of the scanned image to these 4 coordinates.
3. Run a GDAL script to insert GCPs and warp the image.

### Step-by-Step Scripting Workflow

#### 1. Gather Sheet Dimensions and Corners
Create a metadata CSV file listing the filename and its bounding box:
```csv
filename,xmin,ymin,xmax,ymax
fletcher_sheet_1.jpg,-61.0,46.0,-60.5,46.5
fletcher_sheet_2.jpg,-61.5,46.0,-61.0,46.5
```

#### 2. Python Warping Script
Use this Python script (using `gdal`) to assign the coordinates to the image corners and warp it into EPSG:3857 (Web Mercator) format:

```python
import os
import subprocess
from OSGeo import gdal

def georeference_sheet(image_path, xmin, ymin, xmax, ymax, output_path):
    # Open image to get pixel dimensions
    ds = gdal.Open(image_path)
    width = ds.RasterXSize
    height = ds.RasterYSize
    ds = None

    # Define GCPs mapping image corners to geographic coordinates (WGS84 EPSG:4326)
    # GCP: (geographic_lon, geographic_lat, elevation, pixel_x, pixel_y)
    gcp_list = [
        # Top Left
        f"-gcp 0 0 {xmin} {ymax}",
        # Top Right
        f"-gcp {width} 0 {xmax} {ymax}",
        # Bottom Right
        f"-gcp {width} {height} {xmax} {ymin}",
        # Bottom Left
        f"-gcp 0 {height} {xmin} {ymin}"
    ]
    
    # 1. Translate image with GCPs
    translated_tif = "temp_translated.tif"
    translate_cmd = [
        "gdal_translate",
        "-of", "GTiff",
        "-a_srs", "EPSG:4326"
    ]
    for gcp in gcp_list:
        translate_cmd.extend(gcp.split())
    translate_cmd.extend([image_path, translated_tif])
    subprocess.run(translate_cmd, check=True)

    # 2. Warp image to Web Mercator (EPSG:3857) using Bilinear interpolation
    subprocess.run([
        "gdalwarp",
        "-s_srs", "EPSG:4326",
        "-t_srs", "EPSG:3857",
        "-r", "bilinear",
        "-of", "GTiff",
        translated_tif,
        output_path
    ], check=True)
    
    # Clean up temp files
    os.remove(translated_tif)

# Example usage:
# georeference_sheet("sheet_12.jpg", -60.8, 46.1, -60.3, 46.4, "sheet_12_warped.tif")
```

#### 3. Slice into Map Tiles
Once you have the warped GeoTIFF (`sheet_12_warped.tif`), convert it into XYZ tiles for the iOS app using `gdal2tiles.py`:
```bash
gdal2tiles.py --xyz -z 10-15 sheet_12_warped.tif Tiles/Fletcher_New
```
This generates the `{z}/{x}/{y}.png` folder structure that `MapKitTileLayer` can read locally from your bundle.

---

## Path 3: Manual Georeferencing in QGIS

If automated script parameters are hard to set up (due to map distortion or lack of precise coordinates printed on boundaries), use **QGIS** (which is open source and very user-friendly).

1. **Install QGIS:** Download from [qgis.org](https://qgis.org).
2. **Open Georeferencer:**
   - Go to **Layer** > **Georeferencer**.
3. **Add Map Sheet:** Click **Open Raster** and load your map image.
4. **Identify Control Points:**
   - Click a known point on the historical map (e.g., river mouth, road intersection, lighthouse, town center).
   - Enter coordinates manually, or click **From Map Canvas** to select the corresponding point on a modern basemap (like OpenStreetMap or Apple/Google Maps loaded into QGIS).
   - *Aim for at least 4-6 points distributed evenly across the sheet.*
5. **Set Transformation Settings:**
   - **Transformation Type:** *Polynomial 1* (for minor distortions) or *Thin Plate Spline* (for older paper maps that have shrunk/distorted).
   - **Target SRS:** `EPSG:3857` (WGS 84 / Pseudo-Mercator).
   - **Output Raster:** Save as a GeoTIFF.
6. **Generate Tiles:**
   - Run QGIS's built-in **Generate XYZ Tiles (Directory)** tool (found in the Processing Toolbox) on your georeferenced GeoTIFF to export the tile directory structure directly.
