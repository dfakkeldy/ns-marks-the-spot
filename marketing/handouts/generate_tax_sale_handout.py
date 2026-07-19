#!/usr/bin/env python3
"""Generate the one-page NS tax-sale map and guide handout."""

from pathlib import Path

from reportlab.graphics import renderPDF
from reportlab.graphics.barcode import qr
from reportlab.graphics.shapes import Drawing
from reportlab.lib.colors import Color, HexColor, black, white
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "output" / "pdf" / "ns-tax-sale-map-guide-handout.pdf"
MAP_SCREENSHOT = ROOT / "marketing" / "handouts" / "assets" / "ns-tax-sale-map-view.jpg"

MAP_URL = "https://kinnokilabs.com/apps/nsmarksthespot/map/"
GUIDE_URL = "https://kinnokilabs.com/apps/nsmarksthespot/"

INK = black
PAPER = white
MID = HexColor("#555555")
PALE = HexColor("#F3F3F3")


def paragraph_style(name: str, **overrides) -> ParagraphStyle:
    values = {
        "fontName": "Helvetica",
        "fontSize": 9.5,
        "leading": 13,
        "textColor": INK,
        "alignment": TA_LEFT,
        "spaceAfter": 0,
        "spaceBefore": 0,
    }
    values.update(overrides)
    return ParagraphStyle(name, **values)


BODY = paragraph_style("Body")
CARD_BODY = paragraph_style("CardBody", fontSize=8.0, leading=10.4, textColor=MID)


def draw_paragraph(
    pdf: canvas.Canvas,
    text: str,
    x: float,
    top: float,
    width: float,
    height: float,
    style: ParagraphStyle = BODY,
) -> float:
    paragraph = Paragraph(text, style)
    _, used_height = paragraph.wrap(width, height)
    paragraph.drawOn(pdf, x, top - used_height)
    return used_height


def draw_upper_label(
    pdf: canvas.Canvas,
    text: str,
    x: float,
    y: float,
    size: float = 7.2,
    color: Color = MID,
) -> None:
    pdf.setFillColor(color)
    pdf.setFont("Helvetica-Bold", size)
    pdf.drawString(x, y, text.upper())


def draw_pill(pdf: canvas.Canvas, text: str, x: float, y: float, width: float, filled: bool) -> None:
    pdf.setLineWidth(0.8)
    pdf.setStrokeColor(INK)
    pdf.setFillColor(INK if filled else PAPER)
    pdf.roundRect(x, y, width, 18, 9, stroke=1, fill=1)
    pdf.setFont("Helvetica-Bold", 6.8)
    pdf.setFillColor(PAPER if filled else INK)
    label_width = stringWidth(text, "Helvetica-Bold", 6.8)
    pdf.drawString(x + (width - label_width) / 2, y + 6.1, text)


def draw_qr(pdf: canvas.Canvas, url: str, x: float, y: float, size: float) -> None:
    widget = qr.QrCodeWidget(url)
    x1, y1, x2, y2 = widget.getBounds()
    width = x2 - x1
    height = y2 - y1
    drawing = Drawing(size, size, transform=[size / width, 0, 0, size / height, 0, 0])
    drawing.add(widget)
    renderPDF.draw(drawing, pdf, x, y)
    pdf.linkURL(url, (x, y, x + size, y + size), relative=0)


def draw_map_image(
    pdf: canvas.Canvas,
    x: float,
    y: float,
    width: float,
    height: float,
) -> None:
    if not MAP_SCREENSHOT.exists():
        raise FileNotFoundError(f"Map screenshot not found: {MAP_SCREENSHOT}")

    reader = ImageReader(str(MAP_SCREENSHOT))
    pdf.drawImage(
        reader,
        x,
        y,
        width=width,
        height=height,
        preserveAspectRatio=True,
        anchor="c",
    )

    pdf.setStrokeColor(INK)
    pdf.setLineWidth(0.8)
    pdf.rect(x, y, width, height, stroke=1, fill=0)
    pdf.linkURL(MAP_URL, (x, y, x + width, y + height), relative=0)


def draw_format(pdf: canvas.Canvas, label: str, status: str, x: float, top: float, width: float) -> None:
    pdf.setFillColor(INK)
    pdf.setFont("Helvetica-Bold", 8.7)
    pdf.drawString(x, top, label)
    pdf.setFillColor(MID)
    pdf.setFont("Helvetica", 6.3)
    pdf.drawString(x, top - 11, status.upper())
    pdf.setStrokeColor(HexColor("#B7B7B7"))
    pdf.setLineWidth(0.6)
    pdf.line(x, top - 17, x + width, top - 17)


def build_pdf(output: Path = OUTPUT) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    pdf = canvas.Canvas(str(output), pagesize=LETTER, pageCompression=1, invariant=1)
    page_width, _ = LETTER
    pdf.setTitle("See the parcel. Understand the process.")
    pdf.setAuthor("KinNoKi Labs")
    pdf.setSubject("NS Marks The Spot tax-sale map and guide handout")
    pdf.setCreator("NS Marks The Spot handout generator")

    margin = 36
    content_width = page_width - margin * 2

    draw_upper_label(pdf, "NS Marks The Spot / Nova Scotia tax-sale field guide", margin, 758, 7.5, INK)
    pdf.setStrokeColor(INK)
    pdf.setLineWidth(1)
    pdf.line(margin, 748, page_width - margin, 748)

    pdf.setFillColor(INK)
    pdf.setFont("Helvetica-Bold", 29)
    pdf.drawString(margin, 707, "See the parcel.")
    pdf.setFont("Helvetica", 29)
    pdf.drawString(margin, 674, "Understand the process.")
    draw_paragraph(
        pdf,
        "A free online map for exploring supported Nova Scotia municipal tax-sale notices, "
        "paired with a source-led guide for readers, listeners, and viewers.",
        margin,
        645,
        405,
        35,
        paragraph_style("Lede", fontSize=10.2, leading=14.2, textColor=MID),
    )
    draw_pill(pdf, "MAP - LIVE", margin, 596, 76, True)
    draw_pill(pdf, "GUIDE - IN DEVELOPMENT", margin + 86, 596, 142, False)

    map_x = margin
    map_y = 347
    map_width = 420
    map_height = 236.25
    draw_map_image(pdf, map_x, map_y, map_width, map_height)

    qr_panel_x = map_x + map_width + 12
    qr_panel_width = content_width - map_width - 12
    pdf.setFillColor(PALE)
    pdf.setStrokeColor(INK)
    pdf.setLineWidth(0.8)
    pdf.roundRect(qr_panel_x, map_y, qr_panel_width, map_height, 6, stroke=1, fill=1)
    draw_upper_label(pdf, "Open the live map", qr_panel_x + 10, map_y + map_height - 21, 6.4, INK)
    draw_paragraph(
        pdf,
        "Search a PID or civic address. Compare the mapped shape with the dated municipal notice.",
        qr_panel_x + 10,
        map_y + map_height - 31,
        qr_panel_width - 20,
        46,
        paragraph_style("QrBody", fontSize=7.0, leading=9.2, textColor=MID),
    )
    qr_size = 82
    qr_x = qr_panel_x + (qr_panel_width - qr_size) / 2
    qr_y = map_y + 77
    draw_qr(pdf, MAP_URL, qr_x, qr_y, qr_size)
    pdf.setFillColor(INK)
    pdf.setFont("Helvetica-Bold", 6.5)
    pdf.drawCentredString(qr_panel_x + qr_panel_width / 2, map_y + 58, "SCAN TO EXPLORE")
    pdf.setFillColor(MID)
    pdf.setFont("Helvetica", 5.4)
    pdf.drawCentredString(qr_panel_x + qr_panel_width / 2, map_y + 43, "kinnokilabs.com/apps/")
    pdf.drawCentredString(qr_panel_x + qr_panel_width / 2, map_y + 35, "nsmarksthespot/map/")

    draw_upper_label(pdf, "Actual live map view / PID 15356793 / captured July 19, 2026", map_x, 336, 5.6, MID)
    draw_paragraph(
        pdf,
        "Map data (c) OpenStreetMap contributors. Contains information obtained under license from the Province of Nova Scotia, provided without warranty or liability for errors or omissions.",
        map_x,
        327,
        content_width,
        18,
        paragraph_style("MapAttribution", fontSize=5.2, leading=6.7, textColor=MID),
    )

    privacy_y = 289
    privacy_h = 25
    pdf.setFillColor(INK)
    pdf.roundRect(margin, privacy_y, content_width, privacy_h, 4, stroke=0, fill=1)
    privacy_items = ["NO ADS", "NO ACCOUNT", "NO COOKIES", "NO OWNER NAMES"]
    column_width = content_width / len(privacy_items)
    pdf.setFont("Helvetica-Bold", 7.2)
    pdf.setFillColor(PAPER)
    for index, item in enumerate(privacy_items):
        center = margin + column_width * (index + 0.5)
        pdf.drawCentredString(center, privacy_y + 9.2, item)
        if index:
            pdf.setStrokeColor(HexColor("#777777"))
            pdf.setLineWidth(0.5)
            pdf.line(margin + column_width * index, privacy_y + 6, margin + column_width * index, privacy_y + privacy_h - 6)

    pdf.setFillColor(MID)
    pdf.setFont("Helvetica", 6.3)
    pdf.drawString(margin, 277, "No advertising or analytics code. Browser location is optional and handled in the browser.")

    guide_y = 145
    guide_h = 116
    pdf.setStrokeColor(INK)
    pdf.setFillColor(PAPER)
    pdf.roundRect(margin, guide_y, content_width, guide_h, 7, stroke=1, fill=1)
    draw_upper_label(pdf, "The guide / Go beyond the packet", margin + 16, guide_y + guide_h - 20, 6.4, INK)
    pdf.setFillColor(INK)
    pdf.setFont("Helvetica-Bold", 14.5)
    pdf.drawString(margin + 16, guide_y + guide_h - 42, "One guide. Three ways to learn.")
    draw_paragraph(
        pdf,
        "<b>Beyond the Tax-Sale Packet</b> is an illustrated, spoken-first guide to how Nova Scotia "
        "municipal tax sales work and how to research carefully. The book is the source work; it "
        "will also become an audiobook and a video edition.",
        margin + 16,
        guide_y + guide_h - 53,
        290,
        54,
        CARD_BODY,
    )
    pdf.setFillColor(MID)
    pdf.setFont("Helvetica", 6.2)
    pdf.drawString(margin + 16, guide_y + 13, "Details: kinnokilabs.com/apps/nsmarksthespot/")
    pdf.linkURL(GUIDE_URL, (margin + 16, guide_y + 9, margin + 290, guide_y + 23), relative=0)

    formats_x = 366
    draw_format(pdf, "BOOK", "In development", formats_x, guide_y + guide_h - 29, 170)
    draw_format(pdf, "AUDIOBOOK", "Planned from the book", formats_x, guide_y + guide_h - 61, 170)
    draw_format(pdf, "VIDEO", "Planned from the book", formats_x, guide_y + guide_h - 93, 170)

    boundary_y = 77
    boundary_h = 52
    pdf.setFillColor(INK)
    pdf.roundRect(margin, boundary_y, content_width, boundary_h, 7, stroke=0, fill=1)
    pdf.setFillColor(PAPER)
    pdf.setFont("Helvetica-Bold", 11.2)
    pdf.drawString(margin + 16, boundary_y + boundary_h - 20, "A map can tell you where. It cannot tell you whether.")
    draw_paragraph(
        pdf,
        "Boundaries are not a survey. Listings can change. The map and guide do not prove access, title, condition, value, possession, insurance, financing, or buildability. Verify the current municipal source and ask the right qualified professional.",
        margin + 16,
        boundary_y + boundary_h - 27,
        content_width - 32,
        25,
        paragraph_style("Boundary", fontSize=6.6, leading=8.2, textColor=PAPER),
    )

    pdf.setFillColor(INK)
    pdf.setFont("Helvetica-Bold", 7.0)
    pdf.drawString(margin, 56, "KINNOKI LABS")
    pdf.setFillColor(MID)
    pdf.setFont("Helvetica", 6.0)
    pdf.drawString(margin, 43, "Educational tools - not legal, tax, investment, surveying, appraisal, environmental, planning, or construction advice.")
    pdf.setFillColor(INK)
    pdf.setFont("Helvetica-Bold", 6.8)
    footer_url = "kinnokilabs.com/apps/nsmarksthespot/"
    footer_width = stringWidth(footer_url, "Helvetica-Bold", 6.8)
    pdf.drawString(page_width - margin - footer_width, 56, footer_url)
    pdf.linkURL(GUIDE_URL, (page_width - margin - footer_width, 51, page_width - margin, 66), relative=0)

    pdf.showPage()
    pdf.save()


if __name__ == "__main__":
    build_pdf()
    print(OUTPUT)
