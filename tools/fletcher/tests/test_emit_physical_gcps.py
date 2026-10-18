from __future__ import annotations

import json
import unittest

from tools.church.gcps import parse_gcp_csv
from tools.fletcher.emit_physical_gcps import check_outputs, emit
from tools.fletcher.physical_observation import parse_observation
from tools.fletcher.tests.physical_fixtures import valid_observation


class EmitPhysicalGCPTests(unittest.TestCase):
    def test_emits_sorted_role_pure_files(self) -> None:
        emitted = emit(parse_observation(json.dumps(valid_observation())))
        controls = parse_gcp_csv(emitted.controls)
        checks = parse_gcp_csv(emitted.checks)

        self.assertEqual({point.role for point in controls}, {"control"})
        self.assertEqual({point.role for point in checks}, {"check"})
        self.assertEqual(len(controls), 10)
        self.assertEqual(len(checks), 6)
        self.assertEqual(
            [point.label for point in controls],
            sorted(point.label for point in controls),
        )
        self.assertEqual(
            [point.label for point in checks],
            sorted(point.label for point in checks),
        )

    def test_emission_is_byte_deterministic(self) -> None:
        observation = parse_observation(json.dumps(valid_observation()))

        self.assertEqual(emit(observation), emit(observation))

    def test_check_mode_refuses_either_stale_file(self) -> None:
        observation = parse_observation(json.dumps(valid_observation()))
        emitted = emit(observation)
        stale_controls = emitted.controls.replace("control,control-0", "control,stale")
        stale_checks = emitted.checks.replace("check,check-0", "check,stale")

        with self.assertRaisesRegex(ValueError, "controls.*stale"):
            check_outputs(observation, stale_controls, emitted.checks)
        with self.assertRaisesRegex(ValueError, "checks.*stale"):
            check_outputs(observation, emitted.controls, stale_checks)

    def test_refuses_to_emit_a_rejected_observation(self) -> None:
        payload = valid_observation()
        payload["status"] = "rejected"
        payload["terminal_state"] = "insufficient-distribution"
        payload["terminal_reason"] = "controls span less than 70% of the frame"

        with self.assertRaisesRegex(ValueError, "rejected observation"):
            emit(parse_observation(json.dumps(payload)))


if __name__ == "__main__":
    unittest.main()
