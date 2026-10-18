import unittest

from tools.church.counties import COUNTIES, ChurchCounty, get_county


class CountyRegistryTests(unittest.TestCase):
    def test_inverness_carries_verified_rumsey_facts(self) -> None:
        county = get_county("inverness")
        self.assertEqual(county.name, "Inverness")
        self.assertEqual(county.layer_id, "church-inverness")
        self.assertEqual(county.rumsey_id, "RUMSEY~8~1~353591~90120835")
        self.assertEqual(county.pixel_width, 34427)
        self.assertEqual(county.pixel_height, 34543)
        self.assertEqual(county.scale_denominator, 63360)

    def test_published_year_is_publication_not_survey_date(self) -> None:
        # Rumsey's Date field says 1864 (survey/copyright). The Note gives the
        # true publication date, 1884. Shipping 1864 would mislabel the layer.
        self.assertEqual(get_county("inverness").published_year, 1884)

    def test_annapolis_is_registered_without_a_rumsey_source(self) -> None:
        county = get_county("annapolis")
        self.assertEqual(county.published_year, 1876)
        self.assertIsNone(county.rumsey_id)
        self.assertIsNone(county.pixel_width)

    def test_layer_ids_are_unique_and_prefixed(self) -> None:
        ids = [c.layer_id for c in COUNTIES.values()]
        self.assertEqual(len(ids), len(set(ids)))
        for layer_id in ids:
            self.assertTrue(layer_id.startswith("church-"), layer_id)

    def test_unknown_slug_lists_the_known_ones(self) -> None:
        with self.assertRaises(KeyError) as caught:
            get_county("atlantis")
        self.assertIn("inverness", str(caught.exception))

    def test_dataclass_is_frozen(self) -> None:
        with self.assertRaises(Exception):
            get_county("inverness").name = "Mutated"  # type: ignore[misc]

    def test_registry_values_are_church_counties(self) -> None:
        for county in COUNTIES.values():
            self.assertIsInstance(county, ChurchCounty)


if __name__ == "__main__":
    unittest.main()
