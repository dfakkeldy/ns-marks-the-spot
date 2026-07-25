"""Resumable Fletcher sheet coordinator; raster work is injected per item."""

from __future__ import annotations

import datetime
from collections.abc import Callable
from dataclasses import dataclass

from tools.fletcher.manifest import Manifest, may_fetch_new_scan


@dataclass(frozen=True)
class BatchItem:
    sheet_id: str
    rumsey_id: str


def _log(message: str) -> None:
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    print(f"{now} {message}", flush=True)


def run_batch(
    items: list[BatchItem],
    manifest: Manifest,
    *,
    process: Callable[[BatchItem], dict],
    free_bytes: Callable[[], int],
) -> None:
    for item in items:
        if manifest.sheets.get(item.sheet_id, {}).get("stage") == "tiled":
            _log(f"sheet {item.sheet_id}: skip completed")
            continue
        if not may_fetch_new_scan(free_bytes()):
            _log(f"sheet {item.sheet_id}: stop before new fetch; disk gate")
            manifest.update(
                item.sheet_id,
                stage="stopped",
                reason="free disk below 40 GiB before fetch",
            )
            break
        _log(f"sheet {item.sheet_id}: start")
        try:
            fields = process(item)
        except Exception as error:
            _log(f"sheet {item.sheet_id}: failed: {error}")
            manifest.update(item.sheet_id, stage="failed", reason=str(error))
            continue
        manifest.update(item.sheet_id, **fields)
        _log(f"sheet {item.sheet_id}: {fields.get('stage', 'updated')}")
