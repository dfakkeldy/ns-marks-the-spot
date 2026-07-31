"""Cover the observation -> web-importer CSV emitter."""

from __future__ import annotations

import json
import pathlib
import unittest

from tools.fletcher.emit_import_gcps import HEADER, emit, main


def observation(**overrides) -> dict:
    base = {
        "sheet_id": 19,
        "method_version": "feature-led-v2",
        "checks_frozen_at": "2026-07-27",
        "controls": [
            {
                "id": "c23",
                "pixel": {"x": 3917.0, "y": 1670.0},
                "lonlat": {"lon": -61.48652584, "lat": 45.90581083},
            }
        ],
        "final_checks": [
            {
                "id": "cand-0497",
                "pixel": {"x": 4020.0, "y": 5158.0},
                "lonlat": {"lon": -61.4830416, "lat": 45.7930483},
            }
        ],
        "rejected": [{"id": "c13", "reason": "ambiguous"}],
    }
    base.update(overrides)
    return base


class EmitImportGcpsTest(unittest.TestCase):
    def test_controls_and_checks_carry_their_roles(self):
        rows = emit(observation()).splitlines()
        self.assertIn(HEADER, rows)
        body = [r for r in rows if not r.startswith("#") and r != HEADER]
        self.assertEqual(
            body,
            [
                "3917.0,1670.0,-61.48652584,45.90581083,control,c23",
                "4020.0,5158.0,-61.48304160,45.79304830,check,cand-0497",
            ],
        )

    def test_rejected_candidates_are_never_emitted(self):
        # Each rejection carries a recorded reason; emitting them would invite
        # re-litigating calls that were already made and written down.
        self.assertNotIn("c13", emit(observation()))

    def test_states_in_the_file_that_checks_are_not_placed(self):
        # Someone reading only the CSV cannot otherwise tell the check rows are
        # held out by design rather than by oversight.
        header_comments = [
            line for line in emit(observation()).splitlines() if line.startswith("#")
        ]
        self.assertTrue(
            any("NOT placed" in line for line in header_comments), header_comments
        )

    def test_refuses_an_observation_with_no_controls(self):
        with self.assertRaises(ValueError):
            emit(observation(controls=[]))

    def test_emits_checks_section_even_when_absent(self):
        rows = emit(observation(final_checks=[])).splitlines()
        self.assertEqual(len([r for r in rows if r.endswith(",control,c23")]), 1)
        self.assertFalse(any(",check," in r for r in rows))

    def test_round_trips_through_the_cli(self):
        tmp = pathlib.Path(__file__).parent / "_tmp_emit_import"
        tmp.mkdir(exist_ok=True)
        try:
            obs_path = tmp / "obs.json"
            out_path = tmp / "out.csv"
            obs_path.write_text(json.dumps(observation()), encoding="utf-8")
            self.assertEqual(
                main(["--observation", str(obs_path), "--out", str(out_path)]), 0
            )
            self.assertEqual(out_path.read_text(encoding="utf-8"), emit(observation()))
        finally:
            for child in tmp.iterdir():
                child.unlink()
            tmp.rmdir()


if __name__ == "__main__":
    unittest.main()
