import unittest

from tools.church.distances import percentile, summarise_distances


class PercentileTests(unittest.TestCase):
    def test_endpoints(self):
        values = [1.0, 2.0, 3.0, 4.0]
        self.assertEqual(percentile(values, 0.0), 1.0)
        self.assertEqual(percentile(values, 100.0), 4.0)

    def test_interpolates_between_samples(self):
        # numpy's default `linear` method, so figures stay comparable with the
        # 2026-07-24 measurement runs.
        self.assertAlmostEqual(percentile([1.0, 2.0, 3.0, 4.0], 50.0), 2.5)

    def test_single_value(self):
        self.assertEqual(percentile([7.0], 95.0), 7.0)

    def test_rejects_an_empty_field(self):
        with self.assertRaises(ValueError):
            percentile([], 50.0)

    def test_rejects_an_out_of_range_percentile(self):
        with self.assertRaises(ValueError):
            percentile([1.0, 2.0], 101.0)


class SummariseDistancesTests(unittest.TestCase):
    def test_reports_the_shape_of_the_distribution(self):
        summary = summarise_distances([0.0, 100.0, 200.0, 300.0])
        self.assertEqual(summary.samples, 4)
        self.assertAlmostEqual(summary.median_m, 150.0)
        self.assertAlmostEqual(summary.mean_m, 150.0)
        self.assertAlmostEqual(summary.max_m, 300.0)

    def test_rms_exceeds_the_mean_when_the_tail_is_heavy(self):
        # The reason both are reported: a long tail is invisible in the median.
        summary = summarise_distances([10.0] * 99 + [5000.0])
        self.assertLess(summary.median_m, 20.0)
        self.assertGreater(summary.rms_m, 400.0)

    def test_coverage_fractions(self):
        summary = summarise_distances([100.0, 300.0, 700.0, 900.0])
        self.assertAlmostEqual(summary.within_250m_pct, 25.0)
        self.assertAlmostEqual(summary.within_500m_pct, 50.0)

    def test_bands_split_the_field_spatially(self):
        summary = summarise_distances(
            [10.0, 10.0, 2000.0, 2000.0], band_of=[0, 0, 1, 1], band_count=2
        )
        self.assertEqual([band.samples for band in summary.bands], [2, 2])
        self.assertAlmostEqual(summary.bands[0].rms_m, 10.0)
        self.assertAlmostEqual(summary.bands[1].rms_m, 2000.0)

    def test_an_empty_band_reports_none_not_zero(self):
        # Reporting 0.0 for a band with no coverage would read as a perfect
        # score in exactly the direction that flatters the result.
        summary = summarise_distances([10.0, 20.0], band_of=[0, 0], band_count=2)
        self.assertEqual(summary.bands[1].samples, 0)
        self.assertIsNone(summary.bands[1].rms_m)

    def test_rejects_an_empty_field(self):
        with self.assertRaises(ValueError):
            summarise_distances([])

    def test_rejects_mismatched_band_labels(self):
        with self.assertRaises(ValueError):
            summarise_distances([1.0, 2.0], band_of=[0])

    def test_serialises_for_a_report(self):
        payload = summarise_distances([1.0, 2.0], band_of=[0, 1], band_count=2).as_dict()
        self.assertEqual(payload["samples"], 2)
        self.assertEqual(len(payload["bands"]), 2)


if __name__ == "__main__":
    unittest.main()
