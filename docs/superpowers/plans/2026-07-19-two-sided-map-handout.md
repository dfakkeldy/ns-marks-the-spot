# Two-Sided NS Marks The Spot Handout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a polished, duplex-ready US Letter PDF whose front markets the general Nova Scotia land-and-field map and whose back preserves the tax-sale map and book/audiobook/video guide.

**Architecture:** Extend the existing deterministic ReportLab generator with reusable page-level helpers. Keep the existing one-page tax-sale output and add a separate two-page duplex output. Use two documented production screenshots: a new general field-map capture on page 1 and the existing selected tax-sale parcel on page 2.

**Tech Stack:** Python 3, ReportLab, pypdf, Poppler (`pdfinfo`, `pdftoppm`), the production web map, and repository Markdown documentation.

## Global Constraints

- Output is US Letter portrait, front then back, under `output/pdf/`.
- Structure and typography use black, white, and gray; real product captures may remain in colour but must remain legible in grayscale.
- Page 1 leads with address/PID search, Crown Lands, parcel boundaries, field context, and privacy.
- Page 2 retains the tax-sale map plus book, audiobook, and video story.
- Use only verified privacy claims: `NO ADS`, `NO ACCOUNT`, `NO COOKIES`, and `NO OWNER NAMES`.
- Do not claim "no storage" because Province licence acceptance uses browser local storage.
- Crown Lands, mapped routes, and parcel boundaries are context, not proof of permission, public access, legal use, current status, passability, or survey accuracy.
- Do not change app behaviour, web-map behaviour, or GitHub Pages assets.

---

### Task 1: Capture and Document the General Field-Map View

**Files:**
- Create: `marketing/handouts/assets/ns-field-map-view.jpg`
- Modify: `marketing/handouts/assets/README.md`

**Interfaces:**
- Consumes: production map at `https://kinnokilabs.com/apps/nsmarksthespot/map/`
- Produces: a 1280 by 720 JPEG suitable for `reportlab.lib.utils.ImageReader`

- [ ] **Step 1: Open the live production map at a 1280 by 720 viewport**

Use the browser automation surface to load the map without granting browser location access. Wait for the map, layer controls, and Province layers to finish loading.

- [ ] **Step 2: Configure a field-oriented view**

Enable `NS Property Boundaries` and `Crown Lands`. Enable one useful contextual layer that remains visually readable with the first two, preferring `Roads, trails & culverts`, `Water features`, or `NS Aerial`. Select a public mapped parcel or search result only if it improves comprehension; do not show assessed-owner names.

- [ ] **Step 3: Capture and crop the actual product view**

Save the browser screenshot as `marketing/handouts/assets/ns-field-map-view.jpg` at 1280 by 720 pixels. Keep the layer controls visible so the image proves which layers are active.

- [ ] **Step 4: Record provenance**

Add a section to `marketing/handouts/assets/README.md` naming the production URL, capture date `July 19, 2026`, viewport, active layers, any public PID or location displayed, browser-location status, visible data sources, and the statement that Crown Lands and boundaries are context rather than permission or survey evidence.

- [ ] **Step 5: Verify the asset**

Run:

```sh
sips -g pixelWidth -g pixelHeight marketing/handouts/assets/ns-field-map-view.jpg
```

Expected: `pixelWidth: 1280` and `pixelHeight: 720`.

---

### Task 2: Add PDF Contract Tests

**Files:**
- Create: `marketing/handouts/test_generate_tax_sale_handout.py`
- Modify: `marketing/handouts/generate_tax_sale_handout.py`

**Interfaces:**
- Consumes: `build_tax_sale_pdf(output: Path)` and `build_duplex_pdf(output: Path)`
- Produces: automated assertions for page count, page size, headline copy, privacy copy, safety copy, and clickable map URLs

- [ ] **Step 1: Write tests for both output contracts**

Create `marketing/handouts/test_generate_tax_sale_handout.py` with these tests:

```python
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from pypdf import PdfReader

from marketing.handouts.generate_tax_sale_handout import (
    MAP_URL,
    build_duplex_pdf,
    build_tax_sale_pdf,
)


class HandoutTests(unittest.TestCase):
    def test_standalone_tax_sale_pdf_remains_one_page(self) -> None:
        with TemporaryDirectory() as directory:
            output = Path(directory) / "tax-sale.pdf"
            build_tax_sale_pdf(output)
            reader = PdfReader(output)
            self.assertEqual(len(reader.pages), 1)
            self.assertIn("See the parcel.", reader.pages[0].extract_text())

    def test_duplex_pdf_has_field_front_and_tax_sale_back(self) -> None:
        with TemporaryDirectory() as directory:
            output = Path(directory) / "duplex.pdf"
            build_duplex_pdf(output)
            reader = PdfReader(output)
            self.assertEqual(len(reader.pages), 2)
            self.assertEqual(float(reader.pages[0].mediabox.width), 612.0)
            self.assertEqual(float(reader.pages[0].mediabox.height), 792.0)

            front = reader.pages[0].extract_text()
            back = reader.pages[1].extract_text()
            self.assertIn("Find a parcel.", front)
            self.assertIn("CROWN LANDS", front)
            self.assertIn("NO COOKIES", front)
            self.assertIn("not proof of permission", front)
            self.assertIn("Understand the process.", back)
            self.assertIn("AUDIOBOOK", back)
            self.assertIn("VIDEO", back)

            links = []
            for page in reader.pages:
                for annotation in page.get("/Annots", []):
                    action = annotation.get_object().get("/A")
                    if action and action.get("/URI"):
                        links.append(action.get("/URI"))
            self.assertIn(MAP_URL, links)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Add temporary compatibility names to expose the intended interface**

Replace only the current function declaration with this declaration; keep its
existing body unchanged for this red-test step:

```python
def build_tax_sale_pdf(output: Path = OUTPUT) -> None:
```

Do not implement `build_duplex_pdf` yet.

- [ ] **Step 3: Run the focused test and confirm the new duplex contract fails**

Run:

```sh
python3 -m unittest marketing.handouts.test_generate_tax_sale_handout -v
```

Expected: import failure for `build_duplex_pdf`, proving the duplex output is not yet implemented.

---

### Task 3: Implement the Shared Two-Page Generator

**Files:**
- Modify: `marketing/handouts/generate_tax_sale_handout.py`
- Modify: `marketing/handouts/README.md`
- Create: `output/pdf/ns-marks-the-spot-duplex-handout.pdf`
- Modify: `output/pdf/ns-tax-sale-map-guide-handout.pdf`

**Interfaces:**
- Consumes: `ns-field-map-view.jpg`, `ns-tax-sale-map-view.jpg`, `MAP_URL`, and `GUIDE_URL`
- Produces: `build_tax_sale_pdf(output: Path)` and `build_duplex_pdf(output: Path)`

- [ ] **Step 1: Generalize image and shared-rail helpers**

Change `draw_map_image` to accept an explicit asset path and URL:

```python
def draw_map_image(
    pdf: canvas.Canvas,
    image_path: Path,
    url: str,
    x: float,
    y: float,
    width: float,
    height: float,
) -> None:
    if not image_path.exists():
        raise FileNotFoundError(f"Map screenshot not found: {image_path}")
    reader = ImageReader(str(image_path))
    pdf.drawImage(reader, x, y, width=width, height=height, preserveAspectRatio=True, anchor="c")
    pdf.setStrokeColor(INK)
    pdf.setLineWidth(0.8)
    pdf.rect(x, y, width, height, stroke=1, fill=0)
    pdf.linkURL(url, (x, y, x + width, y + height), relative=0)
```

Extract shared `draw_privacy_rail`, `draw_qr_panel`, and `draw_footer` helpers so the two pages use identical spacing and verified wording.

- [ ] **Step 2: Extract the current page into `draw_tax_sale_page`**

Move the current drawing statements without copy changes under this exact
interface, ending the moved statements with the existing `pdf.showPage()` call:

```python
def draw_tax_sale_page(pdf: canvas.Canvas) -> None:
```

The function must keep the existing headline, actual PID `15356793` map image, guide formats, privacy rail, and due-diligence boundary.

- [ ] **Step 3: Implement `draw_field_map_page`**

Create the page under this exact interface:

```python
def draw_field_map_page(pdf: canvas.Canvas) -> None:
```

Use the headline `Find a parcel. See what surrounds it.` and the lede `A privacy-friendly Nova Scotia map for land research, outdoor exploration, and field planning.` Place the new map capture and QR panel in the same visual grid as the tax-sale page. Below the image, draw four compact job cards: `FIND THE LAND`, `READ THE SURROUNDINGS`, `PLAN THE FIELD VISIT`, and `EXPLORE FURTHER`. Include address/PID, Crown Lands, boundaries, roads/trails/culverts, water/wetlands/flood, browser location, native detailed maps/saved areas, historical maps, and official-source context. Finish with the privacy rail and a black safety panel containing the exact phrase `not proof of permission`.

- [ ] **Step 4: Implement both builders**

Define:

```python
def build_tax_sale_pdf(output: Path = OUTPUT) -> None:
    pdf = create_canvas(output, "See the parcel. Understand the process.", "NS Marks The Spot tax-sale map and guide handout")
    draw_tax_sale_page(pdf)
    pdf.save()


def build_duplex_pdf(output: Path = DUPLEX_OUTPUT) -> None:
    pdf = create_canvas(output, "Find a parcel. See what surrounds it.", "NS Marks The Spot duplex land-map and tax-sale guide handout")
    draw_field_map_page(pdf)
    draw_tax_sale_page(pdf)
    pdf.save()
```

Update the command-line entry point to build and print both output paths.

- [ ] **Step 5: Run the focused tests**

Run:

```sh
python3 -m unittest marketing.handouts.test_generate_tax_sale_handout -v
```

Expected: 2 tests pass.

- [ ] **Step 6: Update generation documentation**

Update `marketing/handouts/README.md` with the two output files, duplex page order, screenshot purposes, monochrome policy, and the explicit statement that generation does not change the website or app.

- [ ] **Step 7: Generate the committed PDFs**

Run:

```sh
python3 marketing/handouts/generate_tax_sale_handout.py
```

Expected: both stable paths are printed and both PDF files exist.

---

### Task 4: Render and Verify the Final Artifact

**Files:**
- Verify: `output/pdf/ns-marks-the-spot-duplex-handout.pdf`
- Verify: `output/pdf/ns-tax-sale-map-guide-handout.pdf`
- Temporary: `tmp/pdfs/ns-marks-duplex/`

**Interfaces:**
- Consumes: final PDFs
- Produces: visual, structural, link, text, grayscale, and QR verification evidence

- [ ] **Step 1: Run structural and text checks**

Run:

```sh
pdfinfo output/pdf/ns-marks-the-spot-duplex-handout.pdf
python3 -m unittest marketing.handouts.test_generate_tax_sale_handout -v
git diff --check
```

Expected: 2 pages, Letter size `612 x 792 pts`, tests pass, and no whitespace errors.

- [ ] **Step 2: Render colour and grayscale pages**

Run:

```sh
mkdir -p tmp/pdfs/ns-marks-duplex/colour tmp/pdfs/ns-marks-duplex/gray
pdftoppm -png -r 150 output/pdf/ns-marks-the-spot-duplex-handout.pdf tmp/pdfs/ns-marks-duplex/colour/page
pdftoppm -gray -png -r 150 output/pdf/ns-marks-the-spot-duplex-handout.pdf tmp/pdfs/ns-marks-duplex/gray/page
```

Expected: two colour PNGs and two grayscale PNGs.

- [ ] **Step 3: Inspect all four rendered pages**

Open each PNG at original detail and verify safe margins, hierarchy, legible body text, readable map layers, no clipping or overlap, and a consistent front/back identity. If any defect is present, adjust the generator, regenerate, and repeat Steps 1-3.

- [ ] **Step 4: Verify both QR codes from rendered output**

Use OpenCV's `QRCodeDetector` against each colour page. Expected decoded value on both pages:

```text
https://kinnokilabs.com/apps/nsmarksthespot/map/
```

- [ ] **Step 5: Remove temporary render files**

Delete only `tmp/pdfs/ns-marks-duplex/` after visual verification. Do not remove committed PDF outputs or source assets.

- [ ] **Step 6: Commit the implementation**

Stage only the design, plan, handout source, tests, documented assets, and two PDF outputs. Commit with:

```sh
git commit -m "docs: add two-sided NS Marks handout"
```

- [ ] **Step 7: Rebase, publish, and verify the review branch**

Run:

```sh
git fetch origin nightly
git rebase origin/nightly
git push -u origin codex/two-sided-map-handout
gh pr create --base nightly --head codex/two-sided-map-handout --title "docs: add two-sided NS Marks handout" --body $'## Summary\n- add a duplex-ready general map and tax-sale handout\n- feature address/PID search, Crown Lands, field context, and verified privacy claims\n- preserve the standalone tax-sale PDF\n\n## Verification\n- python3 -m unittest marketing.handouts.test_generate_tax_sale_handout -v\n- pdfinfo and colour/grayscale rendered-page inspection\n- QR decode checks on both rendered pages'
```

Expected: a ready-for-review PR targeting `nightly`. Check hosted CI and report its passing, failing, pending, or blocked status.
