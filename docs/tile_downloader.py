"""Historical OldMapsOnline-only Fletcher tile downloader.

Do not use this script to create the replacement Hugh Fletcher assets. It is
preserved to document the provenance of the legacy tile pyramid; the current
workflow uses individually identified direct Rumsey scans and independently
measured per-sheet observations.
"""

import os
import sys
import math
import time
import urllib.request
import urllib.error
import urllib.parse

# --- CONFIGURATION ---
# The template URL from David Rumsey / OldMapsOnline (replace with your copied XYZ link).
# Make sure it contains {z}, {x}, and {y} placeholders.
# If OldMapsOnline requires a key, set OLDMAPSONLINE_API_KEY in your shell.
TILE_URL_TEMPLATES = [
    "https://wmts.oldmapsonline.org/maps/80a9ee09-85ea-51f2-88fe-56aed37aea23/2021-10-09T15:20:08.466414Z/{z}/{x}/{y}.png",
    "https://wmts.oldmapsonline.org/maps/9b86f069-b432-5e78-a4c9-306ee238e5fb/2023-06-13T14:40:41.945831Z/{z}/{x}/{y}.png"
]
OLDMAPSONLINE_API_KEY = os.environ.get("OLDMAPSONLINE_API_KEY", "").strip()

# Bounding box for Nova Scotia / Cape Breton sheet 17 area (Min/Max Lon/Lat)
BBOX = {
    "min_lon": -62.0,
    "min_lat": 45.1,
    "max_lon": -60.2,
    "max_lat": 46.0
}

# Zoom levels to download
ZOOM_LEVELS = range(11, 16)

# Output directory inside your Xcode project
OUTPUT_DIR = "Tiles/Fletcher"

# Set to True to force downloading and overwriting existing tiles on disk
OVERWRITE = False

# Delay between requests (in seconds) to prevent getting blocked/banned by the server
REQUEST_DELAY = 0.05

# User-Agent header to mimic a standard web browser
USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

# ---------------------

def with_optional_api_key(url):
    if not OLDMAPSONLINE_API_KEY:
        return url

    separator = "&" if "?" in url else "?"
    encoded_key = urllib.parse.quote(OLDMAPSONLINE_API_KEY, safe="")
    return f"{url}{separator}key={encoded_key}"

def deg2num(lat_deg, lon_deg, zoom):
    lat_rad = math.radians(lat_deg)
    n = 2.0 ** zoom
    xtile = int((lon_deg + 180.0) / 360.0 * n)
    ytile = int((1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n)
    return (xtile, ytile)

def download_tiles():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    total_downloaded = 0
    total_skipped = 0
    
    for TILE_URL_TEMPLATE in TILE_URL_TEMPLATES:
        print(f"\n--- Processing Source: {TILE_URL_TEMPLATE.split('/')[4]} ---")
        for zoom in ZOOM_LEVELS:
            print(f"\n--- Zoom Level {zoom} ---")
            # Get tile coordinate bounds
            x_min, y_max = deg2num(BBOX["min_lat"], BBOX["min_lon"], zoom)
            x_max, y_min = deg2num(BBOX["max_lat"], BBOX["max_lon"], zoom)
            
            # Ensure correct ordering
            x_start, x_end = min(x_min, x_max), max(x_min, x_max)
            y_start, y_end = min(y_min, y_max), max(y_min, y_max)
            
            for x in range(x_start, x_end + 1):
                for y in range(y_start, y_end + 1):
                    # Format download URL
                    tile_url = TILE_URL_TEMPLATE.replace("{z}", str(zoom)).replace("{x}", str(x)).replace("{y}", str(y))
                    tile_url = with_optional_api_key(tile_url)

                    # Setup target paths
                    dest_dir = os.path.join(OUTPUT_DIR, str(zoom), str(x))
                    os.makedirs(dest_dir, exist_ok=True)
                    dest_path = os.path.join(dest_dir, f"{y}.png")

                    # Check if we should skip
                    if os.path.exists(dest_path) and not OVERWRITE:
                        print(f"Skipped existing: {zoom}/{x}/{y}.png")
                        total_skipped += 1
                        continue

                    try:
                        req = urllib.request.Request(
                            tile_url,
                            headers={"User-Agent": USER_AGENT}
                        )
                        with urllib.request.urlopen(req) as response:
                            data = response.read()

                        # Skip writing if the tile is a blank/transparent placeholder (usually < 1.5 KB)
                        if len(data) < 1500:
                            print(f"Skipped: {zoom}/{x}/{y}.png (Blank/Too small)")
                            total_skipped += 1
                            continue

                        with open(dest_path, "wb") as f:
                            f.write(data)

                        total_downloaded += 1
                        print(f"Saved: {zoom}/{x}/{y}.png")
                        time.sleep(REQUEST_DELAY) # Avoid hitting rate limits

                    except urllib.error.HTTPError as e:
                        if e.code in (400, 404):
                            print(f"Skipped: {zoom}/{x}/{y}.png (HTTP {e.code})")
                            total_skipped += 1
                        else:
                            print(f"Error {e.code} downloading {zoom}/{x}/{y}: {e.reason}")
                            time.sleep(1.0)
                    except Exception as e:
                        print(f"Network error downloading {zoom}/{x}/{y}: {e}")
                        time.sleep(1.0)
                    
    print(f"\nFinished! Downloaded: {total_downloaded} tiles. Skipped: {total_skipped} tiles.")


if __name__ == "__main__":
    download_tiles()
