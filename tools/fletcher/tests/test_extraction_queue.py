import copy
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from tools.fletcher.extraction_queue import collect, digest, retryable_length_failure, run, validate, windows


class ExtractionQueueTests(unittest.TestCase):
    crop = {"crop_id": "F22-R01C01", "source_xywh": [1500, 880, 1400, 1400]}

    def answer(self):
        return {"crop_id": "F22-R01C01", "width": 1400, "height": 1400,
                "annotations": [{"local_id": "01", "source_text": "School", "kind": "school",
                                 "reading_status": "clear", "label_boxes_xywh": [[1, 2, 40, 20]]}],
                "unresolved_regions": []}

    def test_windows_cover_every_pixel_with_clipped_edges(self):
        rect = [13, 17, 53, 41]
        covered = set()
        for _, _, (x, y, w, h) in windows(rect, size=20, overlap=4):
            covered.update((xx, yy) for xx in range(x, x + w) for yy in range(y, y + h))
        self.assertEqual(covered, {(x, y) for x in range(13, 66) for y in range(17, 58)})

    def test_invalid_window_settings_rejected(self):
        for kwargs in [{"size": 20, "overlap": 20}, {"size": 0, "overlap": 0}]:
            with self.assertRaises(ValueError):
                list(windows([0, 0, 10, 10], **kwargs))

    def test_wrong_frame_and_bad_boxes_rejected(self):
        for field, value in [("crop_id", "C01"), ("width", 1024)]:
            a = self.answer()
            a[field] = value
            with self.assertRaises(ValueError):
                validate(a, self.crop)
        for box in [[1390, 2, 40, 20], [-1, 2, 40, 20], [1, 2, 0, 20], [1.5, 2, 40, 20], [True, 2, 40, 20]]:
            a = self.answer()
            a["annotations"][0]["label_boxes_xywh"] = [box]
            with self.assertRaises(ValueError):
                validate(a, self.crop)

    def test_duplicate_ids_and_invalid_uncertainty_rejected(self):
        a = self.answer()
        a["annotations"].append(copy.deepcopy(a["annotations"][0]))
        with self.assertRaises(ValueError):
            validate(a, self.crop)
        a = self.answer()
        a["unresolved_regions"] = [{"box_xywh": [1400, 0, 1, 1]}]
        with self.assertRaises(ValueError):
            validate(a, self.crop)

    def test_export_keeps_source_frame_uncertainty_and_incomplete_states(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            sheet = root / "sheet-22"
            attempt = sheet / "runs" / "F22-R01C01"
            attempt.mkdir(parents=True)
            (attempt / "answer.json").write_text(json.dumps(self.answer()))
            (attempt / "receipt.json").write_text(json.dumps({"status": "extracted-unreviewed"}))
            (sheet / "manifest.json").write_text(json.dumps({"sheet": 22, "source_sha256": "abc",
                "source_path": "/private/native.png", "crops": [self.crop,
                {"crop_id": "F22-R01C02", "source_xywh": [2700, 880, 1400, 1400]}]}))
            out = root / "export"
            collect(SimpleNamespace(root=root, out=out))
            result = json.loads((out / "sheet-22-candidates.json").read_text())
            self.assertFalse(result["sheet_finalized"])
            self.assertEqual(result["crops"][1]["status"], "not-started")
            a = result["annotations"][0]
            self.assertIsNone(a["geometry"])
            self.assertEqual(a["source_label_boxes_xywh"], [[1501, 882, 40, 20]])
            self.assertEqual(a["box_status"], "model-estimate-unverified")
            self.assertNotIn("source_path", json.loads((out / "sheet-22-manifest.json").read_text()))

    def test_resume_never_calls_provider_again_for_started_packets(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            sheet = root / "sheet-22"
            packet = sheet / "packets" / self.crop["crop_id"]
            packet.mkdir(parents=True)
            (packet / "source.png").write_bytes(b"fake image; no external calls")
            crop = {**self.crop, "sha256": digest(packet / "source.png")}
            (sheet / "manifest.json").write_text(json.dumps({"crops": [crop]}))
            args = SimpleNamespace(root=root, opencode="fake", workers=1, timeout=1, limit=0, repair_incomplete=True)

            def launch(*unused, **kwargs):
                events = [{"type": "text", "part": {"text": json.dumps(self.answer())}},
                          {"type": "step_finish", "part": {"reason": "stop"}}]
                kwargs["stdout"].write("\n".join(json.dumps(e) for e in events))
                return SimpleNamespace(wait=lambda **kw: 0)

            with patch("tools.fletcher.extraction_queue.subprocess.check_output", return_value="test"), \
                 patch("tools.fletcher.extraction_queue.subprocess.Popen", side_effect=launch) as popen, \
                 patch("tools.fletcher.extraction_queue.time.sleep"), \
                 patch("tools.fletcher.extraction_queue.signal.signal"):
                run(args)
                run(args)
                self.assertEqual(popen.call_count, 1)
                # Even a lost receipt is retained for explicit recovery, not billed again.
                (sheet / "runs" / crop["crop_id"] / "receipt.json").unlink()
                run(args)
                self.assertEqual(popen.call_count, 1)

    def test_only_blank_length_failure_gets_one_recovery(self):
        with tempfile.TemporaryDirectory() as td:
            directory = Path(td)
            cid = self.crop["crop_id"]
            attempt = directory / "runs" / cid
            attempt.mkdir(parents=True)
            (attempt / "receipt.json").write_text(json.dumps({"status": "needs-repair", "finish_reasons": ["length"]}))
            (attempt / "final.txt").write_text("")
            self.assertTrue(retryable_length_failure(directory, cid))
            (attempt / "final.txt").write_text('{"existing": "recover this instead"}')
            self.assertFalse(retryable_length_failure(directory, cid))
            (attempt / "final.txt").write_text("")
            (directory / "previous-runs" / cid).mkdir(parents=True)
            self.assertFalse(retryable_length_failure(directory, cid))


if __name__ == "__main__":
    unittest.main()
