#!/usr/bin/env python3
"""Resolve an xcodebuild destination from `xcodebuild -showdestinations`."""

from __future__ import annotations

import re
import sys


DESTINATION_PATTERN = re.compile(r"\{ (?P<body>.+) \}")
PREFERRED_DEVICE_NAME = "iPhone 17 Pro"


def os_sort_key(version: str) -> tuple[int, ...]:
    return tuple(int(part) for part in version.split(".") if part.isdigit())


def parse_destination(line: str) -> dict[str, str] | None:
    match = DESTINATION_PATTERN.search(line)
    if match is None:
        return None

    fields: dict[str, str] = {}
    for part in match.group("body").split(", "):
        if ":" not in part:
            continue
        key, value = part.split(":", 1)
        fields[key.strip()] = value.strip()

    if fields.get("platform") != "iOS Simulator":
        return None

    name = fields.get("name", "")
    if not name.startswith("iPhone"):
        return None

    if "OS" not in fields:
        return None

    return fields


destinations = [
    destination
    for line in sys.stdin
    if (destination := parse_destination(line)) is not None
]

deduplicated: dict[tuple[str, str], dict[str, str]] = {}
for destination in destinations:
    deduplicated[(destination["name"], destination["OS"])] = destination

destinations = sorted(
    deduplicated.values(),
    key=lambda destination: (
        destination["name"] == PREFERRED_DEVICE_NAME,
        os_sort_key(destination["OS"]),
        destination["name"],
    ),
    reverse=True,
)

if not destinations:
    sys.exit(1)

selected = destinations[0]
print(f'platform=iOS Simulator,name={selected["name"]},OS={selected["OS"]}')
