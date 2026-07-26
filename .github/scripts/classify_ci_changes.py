#!/usr/bin/env python3
"""Classify a Git diff into the product CI suites it can affect."""

from __future__ import annotations

import argparse
from pathlib import Path
import sys
from typing import NamedTuple, Sequence


class Classification(NamedTuple):
    web: bool
    native: bool


WEB_ONLY_PREFIXES = ("web/",)
WEB_ONLY_FILES = frozenset({"docs/assets/app-icon.svg"})

DOC_ONLY_PREFIXES = ("docs/", "marketing/")
DOC_ONLY_FILES = frozenset(
    {
        ".gitignore",
        "AGENTS.md",
        "CLAUDE.md",
        "LICENSE",
        "README.md",
    }
)

SHARED_CI_PREFIXES = (".github/",)


def classify_paths(paths: Sequence[str]) -> Classification:
    """Return the suites required for a normalized list of changed paths.

    Unknown paths deliberately fall back to native CI. This keeps new product
    surfaces protected until their ownership is explicitly classified.
    """

    normalized = [path.removeprefix("./") for path in paths if path]
    if not normalized:
        return Classification(web=True, native=True)

    web = False
    native = False

    for path in normalized:
        if path.startswith(SHARED_CI_PREFIXES):
            web = True
            native = True
        elif path in WEB_ONLY_FILES or path.startswith(WEB_ONLY_PREFIXES):
            web = True
        elif path in DOC_ONLY_FILES or path.startswith(DOC_ONLY_PREFIXES):
            continue
        else:
            native = True

    return Classification(web=web, native=native)


def read_paths_from_stdin() -> list[str]:
    data = sys.stdin.buffer.read()
    if not data:
        return []

    separator = b"\0" if b"\0" in data else b"\n"
    return [
        item.decode("utf-8", errors="surrogateescape")
        for item in data.split(separator)
        if item
    ]


def write_github_outputs(path: Path, result: Classification) -> None:
    with path.open("a", encoding="utf-8") as output:
        output.write(f"web={'true' if result.web else 'false'}\n")
        output.write(f"native={'true' if result.native else 'false'}\n")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--github-output",
        type=Path,
        help="Append web/native booleans to this GitHub Actions output file.",
    )
    args = parser.parse_args()

    paths = read_paths_from_stdin()
    result = classify_paths(paths)

    if args.github_output is not None:
        write_github_outputs(args.github_output, result)
    else:
        print(f"web={'true' if result.web else 'false'}")
        print(f"native={'true' if result.native else 'false'}")

    print(
        f"Classified {len(paths)} changed path(s): "
        f"web={str(result.web).lower()}, native={str(result.native).lower()}",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
