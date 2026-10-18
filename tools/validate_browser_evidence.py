"""Validate archived browser evidence, independently of product tests."""
import json
import re
from pathlib import Path

root = Path(__file__).resolve().parents[1]
receipt = json.loads((root / "docs/research/2026-07-28-geopdf-browser-acceptance.json").read_text())
if receipt.get("schemaVersion") != 1 or not re.fullmatch(r"[0-9a-f]{40}", receipt.get("headSha", "")):
    raise SystemExit("Acceptance receipt needs schema 1 and a full tested SHA.")
if receipt.get("decision") not in {"pass", "blocked"}:
    raise SystemExit("Acceptance receipt decision must be pass or blocked.")
for key in ("topologies", "browsers", "files", "performance", "cleanup", "networkPrivacy", "screenshots"):
    if not isinstance(receipt.get(key), list) or not receipt[key]:
        raise SystemExit(f"Acceptance receipt needs a non-empty {key} array.")
serialized = json.dumps(receipt, ensure_ascii=False)
if re.search(r"/(?:Users|private/tmp)/", serialized) or "Dan’s" in serialized:
    raise SystemExit("Acceptance receipt contains a private path or device name.")
for entry in receipt["screenshots"]:
    if entry.get("directory") != "docs/research/geopdf-browser-evidence":
        raise SystemExit("Unexpected screenshot directory in acceptance receipt.")
    files = list((root / entry["directory"]).iterdir())
    if len(files) != entry.get("count"):
        raise SystemExit("Archived screenshot count differs from its receipt.")
    for file in files:
        if file.suffix.lower() not in {".jpg", ".jpeg"} or file.read_bytes()[:3] != b"\xff\xd8\xff":
            raise SystemExit(f"Invalid archived JPEG: {file.name}")
print("Archived browser receipt and screenshots validated (not current browser acceptance).")
