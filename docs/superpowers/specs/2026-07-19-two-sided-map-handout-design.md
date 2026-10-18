# Two-Sided NS Marks The Spot Handout Design

## Purpose

Create one print-ready, two-page US Letter PDF intended for duplex printing. The
front introduces NS Marks The Spot as a general Nova Scotia land-research and
field-planning map. The back presents the tax-sale map and the companion
book/audiobook/video guide.

The handout is a marketing artifact only. It must not change the GitHub Pages
site or the live web map.

## Chosen Format

Use one two-page PDF, in front-then-back order. This is preferable to two
separate files because it is ready for ordinary duplex printing and keeps both
sides together. Preserve the existing single-page tax-sale PDF as a separate
artifact so it can still be handed out on its own.

Final output:

`output/pdf/ns-marks-the-spot-duplex-handout.pdf`

## Shared Visual System

- US Letter portrait, with safe print margins.
- Black, white, and gray typography and structure.
- Actual map captures may remain in colour because they are product evidence;
  both captures must remain understandable when printed in grayscale.
- Helvetica family, high contrast, large headline, compact uppercase labels,
  rounded information panels, and a black boundary/disclaimer panel.
- Each side must make sense independently and include a printed URL plus a
  clickable QR code.
- The two sides share the same header/footer rhythm so they read as one piece.

## Front: Land and Field Map

### Message

Primary headline:

> Find a parcel. See what surrounds it.

Supporting line:

> A privacy-friendly Nova Scotia map for land research, outdoor exploration,
> and field planning.

The opening language must not imply an ownership, title, mailing-address, or
survey lookup. Describe address search as finding the mapped parcel associated
with a Nova Scotia civic address or PID.

### Product Proof

Use a new actual production-map capture that demonstrates the general map,
rather than a tax-sale selection. The view should visibly combine:

- Crown Lands;
- NS Property Boundaries;
- useful field context such as roads/trails/culverts, water, or aerial imagery;
- the search controls or an identified parcel; and
- enough surrounding geography to make the relationship between layers clear.

Do not use browser location while capturing. Record the date, public location
or PID if one is shown, visible sources, and active layers in the asset
provenance note.

### Feature Hierarchy

Organize the map around four jobs rather than a raw layer inventory:

1. **Find the land** - Search by Nova Scotia civic address or PID.
2. **Read the surroundings** - Compare boundaries, Crown Lands, aerial imagery,
   roads, trails, culverts, water, wetlands, and flood context.
3. **Plan the field visit** - Use current location on the web; point to the
   native app for detailed maps and saved field areas where connectivity may be
   weak.
4. **Explore further** - Use historical maps, tax-sale context, and official
   source links where applicable.

Audience cues should name hunters and backcountry users, rural-property and
woodlot researchers, hikers and route scouts, anglers and paddlers, and local
history explorers without turning the page into five separate advertisements.

### Privacy Rail

Use the verified claims:

- NO ADS
- NO ACCOUNT
- NO COOKIES
- NO OWNER NAMES

Supporting copy may say there is no advertising or analytics code and that
browser location is optional and handled in the browser. Do not claim "no
storage," because the web app uses local storage for Province licence
acceptance.

### Safety Boundary

State that Crown Lands and mapped routes are context, not proof of permission,
public access, legal hunting or motorized use, current land status, maintenance,
or passability. Boundaries are not a survey. Users must verify regulations,
access, conditions, and official sources.

## Back: Tax-Sale Map and Guide

Retain the existing tax-sale page's core design and actual selected-parcel map
capture. It should continue to communicate:

- the live supported-municipality tax-sale map;
- PID and civic-address parcel finding;
- the distinction between a dated municipal notice and a current sale outcome;
- the source-led book as the primary work;
- audiobook and video editions derived from the book;
- the privacy rail; and
- the existing due-diligence boundary.

Small spacing or wording adjustments are allowed to align the page with the new
front, but the new general-map story must not displace the tax-sale explanation
on this side.

## QR Codes and Links

- Front QR: live web map at
  `https://kinnokilabs.com/apps/nsmarksthespot/map/`.
- Back QR: live web map, with the printed project/guide URL retained elsewhere
  on the page.
- Printed URLs must remain legible without a phone and PDF links must be
  clickable.

## Accessibility and Print Checks

- Verify both pages at 100% scale and in a grayscale rendering.
- Keep all body text readable on an office printer; avoid text below the size
  already used for unavoidable attribution and legal copy.
- Confirm no clipping, overlap, broken glyphs, or low-contrast labels.
- Confirm QR codes decode from the rendered pages.
- Confirm each page is US Letter portrait and the PDF page order is front then
  back.
- Extract PDF text as a secondary check, while treating rendered-page review as
  the layout authority.

## Source and Change Boundaries

- Reuse the ReportLab generator and existing design helpers.
- Add the new screenshot and its provenance alongside the existing tax-sale map
  asset.
- Keep all handout work under `marketing/handouts/` and `output/pdf/`.
- Do not edit `docs/` website assets except for this design specification under
  `docs/superpowers/specs/`.
- Do not change app or web-map behaviour.

## Acceptance Criteria

1. The output is a two-page, duplex-ready US Letter PDF.
2. Page 1 leads with the general land-and-field map and visibly demonstrates
   Crown Lands plus parcel/field context using an actual product capture.
3. Page 2 retains the tax-sale map and guide story.
4. Address/PID, Crown Lands, privacy, and field-use features are prominent.
5. Safety language clearly limits access, hunting, route, boundary, and
   due-diligence interpretations.
6. Both pages remain polished and understandable in monochrome.
7. The live website and application are unchanged.
