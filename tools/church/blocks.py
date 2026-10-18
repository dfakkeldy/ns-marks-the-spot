"""Block-minimum reduction of a Church scan.

Averaging is the wrong reduction for this material. The printed graticule is a
1-3 pixel dashed hairline on a busy engraved ground; averaged down by 4 it is
diluted into the paper and the Hough transform never sees it. Taking the
DARKEST pixel in each block instead preserves any line that touches the block
at all, which is exactly the property detection needs.

The same argument applies across the colour bands before it applies across the
block: engraved ink is dark in red, green and blue alike, while paper stain and
foxing are dark in only one. Taking the per-pixel minimum across bands first
therefore suppresses stain while keeping ink.

The array plumbing lives in `minreduce.py`, which needs GDAL. The geometry and
the reduction rule live here, so both stay testable with no dependencies.
"""

from __future__ import annotations

from dataclasses import dataclass

__all__ = ["Strip", "block_min", "reduced_shape", "strip_plan"]


def reduced_shape(width: int, height: int, factor: int) -> tuple[int, int]:
    """Output size of a block reduction, discarding any partial trailing block.

    Truncating rather than padding keeps the mapping from reduced pixel to
    source pixel exactly `reduced * factor`, with no special case at the far
    edge. A Church sheet is tens of thousands of pixels across; losing up to
    `factor - 1` of them off the margin costs nothing, and the margin is blank
    paper outside the neat line in any case.
    """
    if factor < 1:
        raise ValueError(f"reduction factor must be at least 1, got {factor}")
    if width < 0 or height < 0:
        raise ValueError(f"negative raster size: {width}x{height}")
    return width // factor, height // factor


@dataclass(frozen=True)
class Strip:
    """One horizontal band of work, in source-pixel terms."""

    out_y: int
    out_rows: int

    def source_y(self, factor: int) -> int:
        return self.out_y * factor

    def source_rows(self, factor: int) -> int:
        return self.out_rows * factor


def strip_plan(out_height: int, factor: int, max_source_rows: int) -> list[Strip]:
    """Split a reduction into bands that fit in memory.

    The full Inverness sheet is 34,427 x 34,543 in three bands - about 3.5 GB
    if read whole. Every strip is a whole number of output rows so no block is
    ever split across two reads.
    """
    if factor < 1:
        raise ValueError(f"reduction factor must be at least 1, got {factor}")
    if max_source_rows < factor:
        raise ValueError(
            f"a strip must hold at least one block row: {max_source_rows} < {factor}"
        )
    rows_per_strip = max(1, max_source_rows // factor)
    strips: list[Strip] = []
    out_y = 0
    while out_y < out_height:
        strips.append(Strip(out_y, min(rows_per_strip, out_height - out_y)))
        out_y += rows_per_strip
    return strips


def block_min(rows: list[list[int]], factor: int) -> list[list[int]]:
    """Reduce a 2-D grid by taking the minimum of each `factor` x `factor` block.

    Reference implementation. `minreduce.py` does the same thing with numpy on
    real rasters; this one defines what "the same thing" means and is what the
    tests check, on both hosts.
    """
    if factor < 1:
        raise ValueError(f"reduction factor must be at least 1, got {factor}")
    if not rows:
        return []
    width = len(rows[0])
    if any(len(row) != width for row in rows):
        raise ValueError("block_min needs a rectangular grid")

    out_width, out_height = reduced_shape(width, len(rows), factor)
    return [
        [
            min(
                rows[out_y * factor + dy][out_x * factor + dx]
                for dy in range(factor)
                for dx in range(factor)
            )
            for out_x in range(out_width)
        ]
        for out_y in range(out_height)
    ]
