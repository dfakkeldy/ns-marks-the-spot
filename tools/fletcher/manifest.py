"""Atomic per-sheet checkpoints for an interruptible Fletcher batch."""

from __future__ import annotations

import datetime
import json
import os
import pathlib

MINIMUM_FREE_BYTES = 40 * 1024**3


def may_fetch_new_scan(free_bytes: int) -> bool:
    return free_bytes >= MINIMUM_FREE_BYTES


class Manifest:
    def __init__(self, path: pathlib.Path):
        self.path = path
        if path.exists():
            payload = json.loads(path.read_text(encoding="utf-8"))
        else:
            payload = {"version": 1, "sheets": {}}
        self.version = int(payload.get("version", 1))
        self.sheets: dict[str, dict] = dict(payload.get("sheets", {}))

    def update(self, sheet_id: str, **fields: object) -> None:
        current = dict(self.sheets.get(sheet_id, {}))
        current.update(fields)
        current["updated_at"] = datetime.datetime.now(
            datetime.timezone.utc
        ).isoformat()
        self.sheets[sheet_id] = current
        self._write()

    def _write(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix(self.path.suffix + ".tmp")
        temporary.write_text(
            json.dumps(
                {"version": self.version, "sheets": self.sheets},
                indent=2,
                sort_keys=True,
            )
            + "\n",
            encoding="utf-8",
        )
        os.replace(temporary, self.path)
