"""Prepare a panel-local GCP VRT without materializing a warped raster."""

from __future__ import annotations

import argparse
import pathlib
import subprocess

from tools.church.gcps import load_gcps
from tools.church.georeference import build_translate_command
from tools.church.panels import get_panel


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("county")
    parser.add_argument("panel")
    parser.add_argument("--source", type=pathlib.Path, required=True)
    parser.add_argument("--gcps", type=pathlib.Path, required=True)
    parser.add_argument("--out", type=pathlib.Path, required=True)
    args = parser.parse_args(argv)

    panel = get_panel(args.county, args.panel)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        build_translate_command(
            str(args.source),
            str(args.out),
            load_gcps(args.gcps),
            panel.window,
        ),
        check=True,
    )
    print(args.out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
