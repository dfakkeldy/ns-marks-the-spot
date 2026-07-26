"""Geographic panels embedded in A.F. Church county sheets.

Some Church sheets are composites: the county is split into multiple map
panels and surrounded by title art or town-plan insets. A panel owns an
explicit non-rectangular `cutline`, while GCP CSVs continue to use coordinates
from the complete archival scan.

Every coordinate below was measured, not estimated. `tools/church/detect_rules.py`
block-minimum reduces the scan, thresholds the heavy engraved rules, and runs a
probabilistic Hough transform; the resulting segments give the neat lines, the
panel divider, and every inset box to within a few pixels. The derivation and
the exact segment evidence are recorded in
`docs/church-inverness-cutlines-2026-07-24.md`.
"""

from __future__ import annotations

from dataclasses import dataclass, replace

from tools.church.cutlines import Cutline
from tools.church.graticule import GraticuleAnchor
from tools.church.windows import SourceWindow

__all__ = [
    "ChurchPanel",
    "DetectionSettings",
    "DrawnCheckSettings",
    "GeographicBounds",
    "GraticuleSettings",
    "HeadlandCheckSettings",
    "SourceWindow",
    "get_panel",
    "panels_for_county",
]


@dataclass(frozen=True)
class DetectionSettings:
    """How to find one panel's graticule linework in the scan.

    Versioned rather than typed on a command line. These are not preferences:
    re-running the Inverness north detection at the tool's default minimum
    length of 600 reduced pixels instead of the 500 actually used finds only
    four of the six parallels, and silently emits a 20-point mesh instead of a
    30-point one. A parameter that changes how many control points exist
    belongs in version control.
    """

    factor: int
    darkness: int
    min_length_px: int
    angles_deg: tuple[float, float] | None
    """Pinned family angles, measured from a printed label. None means fall back
    to the orientation histogram, which dense coastal hachure can win."""


@dataclass(frozen=True)
class DrawnCheckSettings:
    """How to read a drawn island's centroid off one panel's engraving.

    Versioned for the same reason `DetectionSettings` is, and with more at stake:
    these numbers decide the held-out measurement itself. `search_radius_px` in
    particular is the one knob that could be tuned until a panel passed, so it is
    committed where a reviewer can see it against the errors it admits.

    It must stay comfortably LARGER than the biggest error under test - it exists
    to exclude a different island two coves away, not to pull an answer toward
    the prediction. At 2.718 m per source pixel the 500 px below is 1,359 m,
    against a worst attempt-4 residual of 798 m.
    """

    darkness: int
    tile_px: int
    dilate_px: int
    min_ink_px: int
    search_radius_px: float
    reader: str = "ink-outline"
    """Which two-sided island rule reads the engraving.

    `ink-outline` traces a connected shoreline stroke. `enclosed-paper` traces
    the paper region sealed inside that stroke, which survives names and hachure
    drawn within Richmond's islands.
    """


@dataclass(frozen=True)
class HeadlandCheckSettings:
    """How to read a drawn headland's tip off one panel's engraving.

    Versioned for the same reason `DrawnCheckSettings` is, and the same warning
    applies: these numbers decide a held-out measurement, so they are committed
    where a reviewer can see them against the errors they admit.

    `factor` is the one setting here that is about cost rather than judgement.
    Finding the shoreline means flood-filling the PAPER, which is dense, so a
    tile costs its own area - unlike the island detector, which walks only ink.
    Reducing by 2 quarters that at 5.44 m per pixel, still seventy times finer
    than the 400 m the panel is being judged against. `block_min_reduce` takes
    the darkest pixel of each block, so a hairline coast survives the reduction
    rather than being averaged into the paper.
    """

    factor: int
    darkness: int
    tile_px: int
    """CAP on the tile side, in SOURCE pixels. A cost limit, not a measurement
    choice: the working tile is derived per candidate from that candidate's own
    box, because prominence is deviation from a CHORD and a chord is only defined
    by the stretch it spans. Measure the drawn tip over 8 km of coast and the
    modern one over 2 km and the ratio compares a headland against two different
    baselines - it would look like disagreement where there is none.

    3,000 source px is 8.2 km, and no north candidate box reaches it."""
    dilate_px: int
    min_region_share: float
    """Least share of the tile a paper region must cover to be worth measuring.

    A SHARE and not a pixel count, because the tile is sized per candidate from
    its own box. The first north run expressed this as 40,000 reduced pixels,
    which was reasonable for the 1,500 px tile it was written against and absurd
    for the 328 px tiles that arrived - it demanded a region covering 37 % of the
    tile, and threw away a clean shoreline read of 28,329 px without considering
    it.

    Measured populations on the north tiles: sea and land fills come back at
    11-80 % of the tile, while the cells a map is full of - fields, lots, the
    insides of letters - sit at 0.2-2.9 %. The cut goes between them.
    """
    graticule_mask_px: int
    """How far from an engraved graticule line the boundary stops being coast.

    Church rules his parallels and meridians straight across the sea, so the
    paper fill follows them: on the first north run six of nine tiles chose a
    tip sitting on a ruled line at the tile edge. The swathe is CUT from the
    path, not erased from the ink - erasing would break the shoreline wherever
    the two cross and let the fill pour through - so this only needs to cover the
    rule's own width plus the dilation, not to be conservative.

    8 reduced pixels is 43 m, against rules measured at 7-16 source pixels.
    """
    min_tile_px: int
    """Floor on the working tile, in SOURCE pixels. A window too small to carry a
    chord cannot measure anything, whatever its candidate box says."""
    search_radius_px: float
    """In SOURCE pixels, and deliberately larger than the largest error under
    test. It exists to exclude the next cove along, not to pull an answer toward
    the prediction; at 2.718 m per source pixel the 700 px below is 1,903 m,
    against a tolerance maximum of 1,500 m."""


@dataclass(frozen=True)
class GraticuleSettings:
    """How to turn a panel's detected linework into named control points.

    The anchor is the reading of a printed degree/minute label off the archival
    scan. Committing it is what lets the control CSV be regenerated byte-for-
    byte instead of depending on whatever someone typed the first time - the
    first emission of the Inverness north CSV typed the anchor latitude as
    `46.833333` rather than exactly 46 degrees 50 minutes, and every coordinate
    in the file inherited that rounding.
    """

    anchor: GraticuleAnchor
    tolerance_px: float
    min_extent_px: tuple[float, float]
    """Shortest line admitted to each family, (meridians, parallels).

    Per family because the two rarely face the same competition. On the south
    panel the roads run north to south along the coast, so they impersonate
    meridians and not parallels; admitting lines of 3,500 px there fits a
    nonsense 967 px pitch through a bundle of roads, while the 15,000 px needed
    to exclude them would throw away three of the four real parallels.
    """
    anchor_evidence: str
    longitude_correction_arcseconds: float = 0.0
    """External, independently measured longitude correction.

    This is deliberately separate from `anchor`: the anchor records what Church
    engraved, while this records a correction learned off-sample. Folding the
    two together would erase the distinction between source evidence and a
    measured calibration.
    """
    correction_evidence: str | None = None

    def __post_init__(self) -> None:
        if self.longitude_correction_arcseconds and not self.correction_evidence:
            raise ValueError(
                "a longitude correction needs independent correction evidence"
            )

    @property
    def control_anchor(self) -> GraticuleAnchor:
        """Anchor used for GCP emission after any external calibration."""
        return replace(
            self.anchor,
            meridian_lon=(
                self.anchor.meridian_lon
                + self.longitude_correction_arcseconds / 3600.0
            ),
        )


@dataclass(frozen=True)
class GeographicBounds:
    """A target longitude/latitude extent in west, south, east, north order."""

    west: float
    south: float
    east: float
    north: float


@dataclass(frozen=True)
class ChurchPanel:
    """One independently georeferenced geographic panel on a county sheet."""

    county_slug: str
    slug: str
    cutline: Cutline
    target_bounds: GeographicBounds
    target_resolution_m: float
    detection: DetectionSettings | None = None
    drawn_checks: "DrawnCheckSettings | None" = None
    headland_checks: "HeadlandCheckSettings | None" = None
    graticule: GraticuleSettings | None = None
    """None until a panel's printed graticule has actually been read off the scan.

    Deliberately not defaulted to the neighbouring panel's settings: the two
    Inverness panels are drawn on different projection centres, so their
    meridians and parallels meet the sheet at different angles.
    """

    def draws(self, sheet_x: float, sheet_y: float) -> bool:
        """True when this panel's cutline encloses a full-sheet pixel.

        A held-out check feature can only be read where the panel actually put
        ink. Several attempt-3 north candidates predicted onto the title
        cartouche or an inset, and came back as blank tiles that read as "the
        feature is not drawn" when the truth was "this is not the map".
        """
        return self.cutline.contains(sheet_x, sheet_y)

    @property
    def window(self) -> SourceWindow:
        """Smallest whole-pixel crop feeding gdal_translate -srcwin.

        Derived, never stored: a window that could drift out of step with its
        cutline is the 2026-07-24 failure waiting to happen again.
        """
        return self.cutline.bounding_window


# The 1884 Inverness sheet is split by a two-segment engraved divider, not the
# single straight edge a first reading suggests. Fitted from the Hough segments:
#
#   upper  x(y) = 15852 - 0.175874 * (y -   732)   for   732 <= y <= 23928
#   lower  x(y) = 11776 - 0.466540 * (y - 23924)   for 23928 <= y <= 29550
#
# meeting at the bend (11773, 23928). Each panel's cutline is offset 60 px to
# its own side of that centreline so the ~30 px engraved rule itself is warped
# into neither panel.
_DIVIDER_NORTH_HEAD = (15784.0, 780.0)
_DIVIDER_NORTH_BEND = (11713.0, 23928.0)
_DIVIDER_NORTH_FOOT = (9283.0, 29140.0)

_DIVIDER_SOUTH_HEAD = (15904.0, 780.0)
_DIVIDER_SOUTH_BEND = (11833.0, 23928.0)
_DIVIDER_SOUTH_FOOT = (9225.0, 29520.0)

_INVERNESS_NORTH_CUTLINE = Cutline(
    (
        # East along the top neat line from the title block to the divider.
        (8850.0, 780.0),
        _DIVIDER_NORTH_HEAD,
        # Down the divider, through its bend, to the panel's own bottom rule.
        _DIVIDER_NORTH_BEND,
        _DIVIDER_NORTH_FOOT,
        # West along the "NORTHERN SECTION" bottom rule (detected at y~29160).
        (1050.0, 29140.0),
        # North up the west neat line, then step around the title cartouche,
        # compass rose, and imprint - all of which sit over open Gulf water, so
        # excluding them costs no map content.
        (1050.0, 9200.0),
        (8850.0, 9200.0),
    )
)

_INVERNESS_SOUTH_CUTLINE = Cutline(
    (
        _DIVIDER_SOUTH_HEAD,
        # Notch around the engraved building vignette, which sits offshore in
        # Northumberland Strait.
        (17050.0, 780.0),
        (17050.0, 3550.0),
        (20100.0, 3550.0),
        (20100.0, 780.0),
        # East neat line, stepping around the West Bay inset.
        (33500.0, 780.0),
        (33500.0, 9850.0),
        (30380.0, 9850.0),
        (30380.0, 14120.0),
        (33500.0, 14120.0),
        # ... and around the Port Hood inset, which reaches the bottom rule.
        (33500.0, 28100.0),
        (30120.0, 28100.0),
        (30120.0, 30330.0),
        # West along the top of the bottom inset row: Port Hastings, Margaree,
        # then down into the Strait of Canso gap, then Mabou and Whycocomagh.
        (25580.0, 30330.0),
        (25580.0, 30900.0),
        (22620.0, 30900.0),
        (22620.0, 33750.0),
        (16920.0, 33750.0),
        (16920.0, 30440.0),
        (12680.0, 30440.0),
        (12680.0, 29520.0),
        _DIVIDER_SOUTH_FOOT,
        _DIVIDER_SOUTH_BEND,
    )
)

# Two degree/minute labels were read directly off the scan. 60d40'W x 47d00'N
# sits at ~(12388, 3188), where the fitted meridian at index 0 passes through
# x = 12,389 - a one-pixel agreement. 60d50'W was then PREDICTED at x = 9,521
# before its crop was taken, and measured at 9,526. Two labels ten arcminutes
# and two lattice steps apart fix the step at 5 arcminutes and rule out the 10'
# alternative; independently, a 10' step would put the westernmost meridian
# offshore at 61d20'W, whereas it falls inland of the coast.
_INVERNESS_NORTH_GRATICULE = GraticuleSettings(
    anchor=GraticuleAnchor(
        meridian_index=0,
        meridian_lon=-61.0,
        parallel_index=0,
        parallel_lat=46.0 + 50.0 / 60.0,
        step_minutes=5.0,
    ),
    tolerance_px=120.0,
    min_extent_px=(3500.0, 3500.0),
    anchor_evidence=(
        "engraved labels 60d40'W x 47d00'N at ~(12388,3188) and 60d50'W at "
        "~(9526,28276) on RUMSEY~8~1~353591~90120835"
    ),
)

_INVERNESS_NORTH_DETECTION = DetectionSettings(
    factor=4,
    darkness=140,
    min_length_px=500,
    angles_deg=(84.5, 174.5),
)

# The south panel carries a 10-arcminute lattice, NOT the north panel's 5. Four
# printed labels were read directly off the scan, two per family:
#
#   "61 10'" at ~(25055, 850), the rule passing between the "61" and the "10'"
#   "61 00'" at ~(29678, 850), likewise
#   "46 00"  at ~(33320, 17074), sitting on its rule at y ~ 17146
#   "45 50"  at ~(33320, 23835), sitting on its rule at y ~ 23880
#
# The fitted meridian pitch of 4,714.9 px and parallel pitch of 6,814.4 px agree
# with the label separations (4,623 px and 6,734 px) to within 2 %, and the
# fitted rules land within 30 px of the two longitude labels and within 22 px of
# the two latitude labels.
#
# Cross-check against the north panel, which settles the step independently:
# north parallels are 3,413.7 px per 5' = 682.7 px per arcminute; south are
# 6,814.4 px per 10' = 681.4 px per arcminute. At 1,852 m per arcminute both
# imply 2.718 m per source pixel - the same engraving, two different steps.
_INVERNESS_SOUTH_GRATICULE = GraticuleSettings(
    anchor=GraticuleAnchor(
        meridian_index=0,
        meridian_lon=-(61.0 + 20.0 / 60.0),
        parallel_index=0,
        parallel_lat=46.0 + 10.0 / 60.0,
        step_minutes=10.0,
    ),
    tolerance_px=120.0,
    min_extent_px=(15000.0, 5000.0),
    anchor_evidence=(
        "engraved labels 61d10'W at ~(25055,850), 61d00'W at ~(29678,850), "
        "46d00'N on its rule at y~17146 and 45d50'N at y~23880, all read off "
        "RUMSEY~8~1~353591~90120835"
    ),
    longitude_correction_arcseconds=-17.0,
    correction_evidence=(
        "rounded from the -16.990 arcsecond mean longitude residual of eight "
        "frozen held-out island centroids on the independently georeferenced "
        "1885 Richmond Church sheet"
    ),
)

# Angles measured off the read labels, not from the orientation histogram: the
# 61d00' meridian stands at ~90 degrees and the 46d00' parallel rule at ~0.17.
# Auto-detection on this panel picks 88.5 / 119.5 and finds no parallels at all,
# because the dense coastal hachure outvotes them.
_INVERNESS_SOUTH_DETECTION = DetectionSettings(
    factor=4,
    darkness=140,
    min_length_px=500,
    angles_deg=(90.1, 0.1),
)

# Shared by both panels: it is one engraving, inked once, scanned once, so there
# is no reason for the two halves to want different numbers.
#
# `darkness` is 190, NOT the 140 the graticule detector uses, and the difference
# is the point. 140 is tuned for the heavy engraved graticule rules; an island
# outline is a hairline drawn several shades lighter, and at 140 the Margaree
# Island tile comes back 1.4 % ink with the island absent from it entirely.
#
# `dilate_px` was measured, not chosen. On Margaree Island the largest enclosed
# shape goes 0.10, 0.16, 1.06 of the modern area at radius 2, 3, 4: the outline
# is broken by 3-4 px gaps and snaps shut between 3 and 4. Radius 6 only adds
# perimeter (1.11) while merging more islands into the mainland, so 4 is the
# smallest radius that actually closes the engraving.
_INVERNESS_DRAWN_CHECKS = DrawnCheckSettings(
    darkness=190,
    tile_px=1400,
    dilate_px=4,
    min_ink_px=200,
    search_radius_px=500.0,
)

_RICHMOND_DRAWN_CHECKS = DrawnCheckSettings(
    darkness=190,
    tile_px=1400,
    dilate_px=4,
    min_ink_px=1000,
    search_radius_px=500.0,
    reader="enclosed-paper",
)

# The headland detector shares `darkness` with the island detector for the same
# reason the island detector shares it across panels: it is one engraving, inked
# once. `dilate_px` is smaller, though, and that is not an oversight. The island
# detector needs 4 because it must CLOSE a dashed outline before any area exists
# to measure; a coast is measured as an open path and never has to close, so the
# only job left is bridging the gaps that would let a paper fill leak from the
# sea into a field. 2 does that at half the smearing of the shoreline itself.
_INVERNESS_HEADLAND_CHECKS = HeadlandCheckSettings(
    factor=2,
    darkness=190,
    tile_px=3000,
    dilate_px=2,
    min_region_share=0.05,
    graticule_mask_px=8,
    min_tile_px=600,
    search_radius_px=700.0,
)

# Richmond's main geography occupies one continuous field, but the archival
# sheet also carries a separate 1886 Nova Scotia reference map, six town-plan
# insets, and the title block. The band below is bounded by measured ruled
# lines: its top sits below the last northern inset, and its bottom stays above
# the Arichat inset rule. It retains the 45d40' and 45d30' parallels and all
# seven meridians from 61d20'W through 60d20'W.
#
# The first Richmond working TIFF was accidentally resampled to 34,509x30,385.
# These full-scan coordinates are the old measured bounds projected through
# that TIFF's recorded pixel transform (1.06825051384355 x,
# 1.01104154809334 y) into the corrected 35,735x30,429 source frame.
_RICHMOND_MAIN_CUTLINE = Cutline(
    (
        (1068.25051384355, 8593.853158793398),
        (34611.316648531014, 8593.853158793398),
        (34611.316648531014, 22141.809903244164),
        (1068.25051384355, 22141.809903244164),
    )
)

# Read directly from RUMSEY~8~1~373669~90140407:
# - 60d50'W is engraved beside the meridian at corrected-source x~17,049;
# - 45d40'N and 45d30'N are engraved on the right margin at corrected-source
#   y~14,834 and y~21,527.
# The neighbouring rules are spaced about 4,512 px east-west and 6,620 px
# north-south in the earlier resampled frame, independently confirming a
# ten-minute lattice.
_RICHMOND_MAIN_GRATICULE = GraticuleSettings(
    anchor=GraticuleAnchor(
        meridian_index=0,
        meridian_lon=-(61.0 + 20.0 / 60.0),
        parallel_index=0,
        parallel_lat=45.0 + 40.0 / 60.0,
        step_minutes=10.0,
    ),
    tolerance_px=120.0,
    # The corrected 1:1 source frame leaves the western 61d20' meridian with
    # 3,748 px of clean detected support. A 5,000 px floor drops that labelled
    # rule and shifts every longitude index east by one step.
    min_extent_px=(3500.0, 10000.0),
    anchor_evidence=(
        "engraved 60d50'W at corrected-source x~17049, 45d40'N at y~14834, "
        "and 45d30'N at y~21527 on RUMSEY~8~1~373669~90140407"
    ),
)

_RICHMOND_MAIN_DETECTION = DetectionSettings(
    factor=4,
    darkness=140,
    min_length_px=500,
    angles_deg=(90.0, 0.0),
)

_PANELS = {
    ("inverness", "north"): ChurchPanel(
        county_slug="inverness",
        slug="north",
        cutline=_INVERNESS_NORTH_CUTLINE,
        target_bounds=GeographicBounds(west=-61.35, south=46.30, east=-60.45, north=47.10),
        target_resolution_m=5.0,
        detection=_INVERNESS_NORTH_DETECTION,
        drawn_checks=_INVERNESS_DRAWN_CHECKS,
        headland_checks=_INVERNESS_HEADLAND_CHECKS,
        graticule=_INVERNESS_NORTH_GRATICULE,
    ),
    ("inverness", "south"): ChurchPanel(
        county_slug="inverness",
        slug="south",
        cutline=_INVERNESS_SOUTH_CUTLINE,
        target_bounds=GeographicBounds(west=-61.70, south=45.55, east=-60.55, north=46.40),
        target_resolution_m=5.0,
        detection=_INVERNESS_SOUTH_DETECTION,
        drawn_checks=_INVERNESS_DRAWN_CHECKS,
        headland_checks=_INVERNESS_HEADLAND_CHECKS,
        graticule=_INVERNESS_SOUTH_GRATICULE,
    ),
    ("richmond", "main"): ChurchPanel(
        county_slug="richmond",
        slug="main",
        cutline=_RICHMOND_MAIN_CUTLINE,
        target_bounds=GeographicBounds(
            west=-61.40,
            south=45.45,
            east=-60.25,
            north=45.75,
        ),
        target_resolution_m=5.0,
        detection=_RICHMOND_MAIN_DETECTION,
        drawn_checks=_RICHMOND_DRAWN_CHECKS,
        graticule=_RICHMOND_MAIN_GRATICULE,
    ),
}


def get_panel(county_slug: str, panel_slug: str) -> ChurchPanel:
    """Return one registered panel."""
    try:
        return _PANELS[(county_slug, panel_slug)]
    except KeyError:
        raise KeyError(f"unknown Church panel: {county_slug}/{panel_slug}") from None


def panels_for_county(county_slug: str) -> list[ChurchPanel]:
    """Return a county's panels in display order."""
    return [
        panel
        for (registered_county, _), panel in _PANELS.items()
        if registered_county == county_slug
    ]
