from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from pypdf import PdfReader

from marketing.handouts.generate_tax_sale_handout import (
    MAP_URL,
    build_duplex_pdf,
    build_tax_sale_pdf,
)


class HandoutTests(unittest.TestCase):
    def test_standalone_tax_sale_pdf_remains_one_page(self) -> None:
        with TemporaryDirectory() as directory:
            output = Path(directory) / "tax-sale.pdf"
            build_tax_sale_pdf(output)
            reader = PdfReader(output)
            self.assertEqual(len(reader.pages), 1)
            self.assertIn("See the parcel.", reader.pages[0].extract_text())

    def test_duplex_pdf_has_field_front_and_tax_sale_back(self) -> None:
        with TemporaryDirectory() as directory:
            output = Path(directory) / "duplex.pdf"
            build_duplex_pdf(output)
            reader = PdfReader(output)
            self.assertEqual(len(reader.pages), 2)
            self.assertEqual(float(reader.pages[0].mediabox.width), 612.0)
            self.assertEqual(float(reader.pages[0].mediabox.height), 792.0)

            front = reader.pages[0].extract_text()
            back = reader.pages[1].extract_text()
            self.assertIn("Find a parcel.", front)
            self.assertIn("CROWN LANDS", front)
            self.assertIn("NO COOKIES", front)
            self.assertIn("not proof of permission", front)
            self.assertIn("Understand the process.", back)
            self.assertIn("AUDIOBOOK", back)
            self.assertIn("VIDEO", back)

            links = []
            for page in reader.pages:
                for annotation in page.get("/Annots", []):
                    action = annotation.get_object().get("/A")
                    if action and action.get("/URI"):
                        links.append(action.get("/URI"))
            self.assertIn(MAP_URL, links)


if __name__ == "__main__":
    unittest.main()
