"""Registry of the A.F. Church county maps (1864-1888, one per Nova Scotia county).

Single source of truth for county metadata shared by the fetch, georeference,
tiling, and documentation steps.

Note on dates: the Rumsey `Date` field carries the 1864 survey/copyright date for
most sheets. The true publication date lives in the item's `Note` field and is
what we display. Inverness is dated 1864 by Rumsey but was published in 1884.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ChurchCounty:
    """One county sheet in the Church series."""

    slug: str
    name: str
    layer_id: str
    published_year: int
    scale_denominator: int
    rumsey_id: str | None = None
    pixel_width: int | None = None
    pixel_height: int | None = None

    @property
    def has_source(self) -> bool:
        """True when a digital source is known for this county."""
        return self.rumsey_id is not None


_REGISTERED = (
    ChurchCounty(
        slug="inverness",
        name="Inverness",
        layer_id="church-inverness",
        published_year=1884,
        scale_denominator=63360,
        rumsey_id="RUMSEY~8~1~353591~90120835",
        pixel_width=34427,
        pixel_height=34543,
    ),
    ChurchCounty(
        slug="victoria",
        name="Victoria",
        layer_id="church-victoria",
        published_year=1884,
        scale_denominator=63360,
        rumsey_id="RUMSEY~8~1~374820~90141224",
    ),
    ChurchCounty(
        slug="richmond",
        name="Richmond",
        layer_id="church-richmond",
        published_year=1885,
        scale_denominator=84269,
        rumsey_id="RUMSEY~8~1~373669~90140407",
    ),
    ChurchCounty(
        slug="cape-breton",
        name="Cape Breton",
        layer_id="church-cape-breton",
        published_year=1884,
        scale_denominator=63360,
        rumsey_id="RUMSEY~8~1~374821~90141223",
    ),
    # No digital source known. See docs/annapolis-church-lac-enquiry.md.
    ChurchCounty(
        slug="annapolis",
        name="Annapolis",
        layer_id="church-annapolis",
        published_year=1876,
        scale_denominator=63360,
    ),
)

COUNTIES: dict[str, ChurchCounty] = {county.slug: county for county in _REGISTERED}


def get_county(slug: str) -> ChurchCounty:
    """Look up a county by slug, naming the valid options when it is missing."""
    try:
        return COUNTIES[slug]
    except KeyError:
        known = ", ".join(sorted(COUNTIES))
        raise KeyError(f"unknown county {slug!r}; known counties: {known}") from None
