#!/usr/bin/env python3
"""Resolve an xcodebuild destination from `xcodebuild -showdestinations`."""

from __future__ import annotations

import re
import sys


DESTINATION_PATTERN = re.compile(r"\{ (?P<body>.+) \}")
# `xcodebuild -showdestinations` prints its destinations under headings, and
# "Ineligible destinations" is one of them: devices that exist and cannot be
# run on, each carrying an `error:` saying why. They were being read as
# candidates, and because the preferred name sorts first, an unavailable
# iPhone 17 Pro would be chosen over a working iPhone 17 and the test run would
# fail on a runner that had a perfectly good simulator.
SECTION_PATTERN = re.compile(r"^\s*(?P<kind>[A-Za-z]+) destinations for the ")
PREFERRED_DEVICE_NAME = "iPhone 17 Pro"


def os_sort_key(version: str) -> tuple[int, ...]:
    return tuple(int(part) for part in version.split(".") if part.isdigit())


def parse_destination(line: str) -> dict[str, str] | None:
    match = DESTINATION_PATTERN.search(line)
    if match is None:
        return None

    body = match.group("body")
    # Said twice, because the section heading and this flag are independent
    # ways of learning the same thing and neither is expensive.
    if "error:" in body:
        return None

    fields: dict[str, str] = {}
    for part in body.split(", "):
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


def eligible_destinations(lines: "list[str]") -> "list[dict[str, str]]":
    """The destinations under the Available heading, and nothing else.

    Nothing is read before a heading appears. A run whose headings this no
    longer recognises resolves no destination and fails the job, which is the
    intended answer: the alternative is testing on whatever happened to parse.
    """
    found: list[dict[str, str]] = []
    available = False
    for line in lines:
        section = SECTION_PATTERN.match(line)
        if section is not None:
            available = section.group("kind") == "Available"
            continue
        if not available:
            continue
        destination = parse_destination(line)
        if destination is not None:
            found.append(destination)
    return found


def select_destination(lines: "list[str]") -> "str | None":
    """The destination argument for `xcodebuild`, or nothing if none will run.

    Newest OS first, and the preferred device ahead of its siblings on the same
    OS. Nothing is a legitimate answer and the caller is expected to fail on it,
    because a test run with no simulator is not a test run.
    """
    deduplicated: dict[tuple[str, str], dict[str, str]] = {}
    for destination in eligible_destinations(lines):
        deduplicated[(destination["name"], destination["OS"])] = destination

    ordered = sorted(
        deduplicated.values(),
        key=lambda destination: (
            destination["name"] == PREFERRED_DEVICE_NAME,
            os_sort_key(destination["OS"]),
            destination["name"],
        ),
        reverse=True,
    )

    if not ordered:
        return None

    selected = ordered[0]
    return f'platform=iOS Simulator,name={selected["name"]},OS={selected["OS"]}'


if __name__ == "__main__":
    resolved = select_destination(sys.stdin.readlines())
    if resolved is None:
        sys.exit(1)
    print(resolved)
