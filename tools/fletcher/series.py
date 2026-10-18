"""Authoritative single-sheet membership and processing order for Fletcher."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class FletcherSheet:
    number: int
    rumsey_id: str

    @property
    def slug(self) -> str:
        return f"sheet-{self.number:02d}"


CATALOG_SHEETS = tuple(
    FletcherSheet(
        number=number,
        rumsey_id=(
            f"RUMSEY~8~1~{2625 + number}~"
            f"{280039 + number if number <= 7 else 289993 + number}"
        ),
    )
    for number in range(1, 25)
)

# The brief prioritizes the already-proven representative sheet, then the rest
# of its Cape Breton composite, then the sixteen mainland sheets.
PRIORITY_SHEETS = (
    CATALOG_SHEETS[16:24] + CATALOG_SHEETS[0:16]
)
