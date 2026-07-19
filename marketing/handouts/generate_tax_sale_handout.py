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
from reportlab.lib.units import inch
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "output" / "pdf" / "ns-tax-sale-map-guide-handout.pdf"

MAP_URL = "https://kinnokilabs.com/apps/nsmarksthespot/map/"
GUIDE_URL = "https://kinnokilabs.com/apps/nsmarksthespot/"

INK = black
PAPER = white
MID = HexColor("#555555")
LIGHT = HexColor("#E7E7E7")
PALE = HexColor("#F5F5F5")


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
SMALL = paragraph_style("Small", fontSize=7.4, leading=9.5, textColor=MID)
CARD_BODY = paragraph_style("CardBody", fontSize=8.2, leading=10.8, textColor=MID)
BOUNDARY = paragraph_style("Boundary", fontSize=8.2, leading=10.6, textColor=INK)


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


def draw_map_motif(pdf: canvas.Canvas, x: float, y: float, width: float, height: float) -> None:
    pdf.saveState()
    pdf.setStrokeColor(HexColor("#A0A0A0"))
    pdf.setLineWidth(0.65)
    parcels = [
        [(0.03, 0.72), (0.33, 0.92), (0.50, 0.66), (0.17, 0.50)],
        [(0.33, 0.92), (0.78, 0.86), (0.76, 0.58), (0.50, 0.66)],
        [(0.17, 0.50), (0.50, 0.66), (0.58, 0.30), (0.10, 0.19)],
        [(0.50, 0.66), (0.76, 0.58), (0.93, 0.28), (0.58, 0.30)],
    ]
    for parcel in parcels:
        path = pdf.beginPath()
        px, py = parcel[0]
        path.moveTo(x + px * width, y + py * height)
        for px, py in parcel[1:]:
            path.lineTo(x + px * width, y + py * height)
        path.close()
        pdf.drawPath(path, stroke=1, fill=0)

    pdf.setStrokeColor(INK)
    pdf.setLineWidth(2.2)
    road = pdf.beginPath()
    road.moveTo(x - 4, y + height * 0.12)
    road.curveTo(
        x + width * 0.24,
        y + height * 0.26,
        x + width * 0.62,
        y + height * 0.52,
        x + width + 4,
        y + height * 0.78,
    )
    pdf.drawPath(road, stroke=1, fill=0)
    pdf.setFillColor(INK)
    pdf.circle(x + width * 0.61, y + height * 0.53, 4.2, stroke=0, fill=1)
    pdf.restoreState()


def draw_step(pdf: canvas.Canvas, number: str, title: str, detail: str, x: float, top: float, width: float) -> None:
    pdf.setFillColor(INK)
    pdf.circle(x + 9, top - 9, 9, stroke=0, fill=1)
    pdf.setFillColor(PAPER)
    pdf.setFont("Helvetica-Bold", 6.6)
    pdf.drawCentredString(x + 9, top - 11.2, number)
    pdf.setFillColor(INK)
    pdf.setFont("Helvetica-Bold", 9.2)
    pdf.drawString(x + 25, top - 6, title)
    draw_paragraph(pdf, detail, x + 25, top - 12, width - 25, 30, CARD_BODY)


def draw_format(pdf: canvas.Canvas, label: str, status: str, x: float, top: float, width: float) -> None:
    pdf.setFillColor(INK)
    pdf.setFont("Helvetica-Bold", 9.2)
    pdf.drawString(x, top, label)
    pdf.setFillColor(MID)
    pdf.setFont("Helvetica", 6.8)
    pdf.drawString(x, top - 12, status.upper())
    pdf.setStrokeColor(HexColor("#B7B7B7"))
    pdf.setLineWidth(0.6)
    pdf.line(x, top - 19, x + width, top - 19)


def build_pdf(output: Path = OUTPUT) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    pdf = canvas.Canvas(str(output), pagesize=LETTER, pageCompression=1, invariant=1)
    page_width, page_height = LETTER
    pdf.setTitle("See the parcel. Understand the process.")
    pdf.setAuthor("KinNoKi Labs")
    pdf.setSubject("NS Marks The Spot tax-sale map and guide handout")
    pdf.setCreator("NS Marks The Spot handout generator")

    margin = 36
    content_width = page_width - margin * 2

    # Masthead and cadastral motif.
    draw_upper_label(pdf, "NS Marks The Spot / Nova Scotia tax-sale field guide", margin, 758, 7.5, INK)
    pdf.setStrokeColor(INK)
    pdf.setLineWidth(1)
    pdf.line(margin, 748, page_width - margin, 748)
    draw_map_motif(pdf, 430, 646, 145, 90)

    pdf.setFillColor(INK)
    pdf.setFont("Helvetica-Bold", 31)
    pdf.drawString(margin, 706, "See the parcel.")
    pdf.setFont("Helvetica", 31)
    pdf.drawString(margin, 670, "Understand the process.")
    draw_paragraph(
        pdf,
        "A free online map for exploring supported Nova Scotia municipal tax-sale notices, "
        "paired with a source-led guide being developed for readers, listeners, and viewers.",
        margin,
        636,
        385,
        46,
        paragraph_style("Lede", fontSize=10.4, leading=14.5, textColor=MID),
    )
    draw_pill(pdf, "MAP - LIVE", margin, 588, 76, True)
    draw_pill(pdf, "GUIDE - IN DEVELOPMENT", margin + 86, 588, 142, False)

    # Live map card.
    map_y = 379
    map_h = 190
    pdf.setFillColor(PALE)
    pdf.setStrokeColor(INK)
    pdf.setLineWidth(1)
    pdf.roundRect(margin, map_y, content_width, map_h, 8, stroke=1, fill=1)
    draw_upper_label(pdf, "01 / Explore what is mapped", margin + 18, map_y + map_h - 25, 6.8, INK)
    pdf.setFillColor(INK)
    pdf.setFont("Helvetica-Bold", 17)
    pdf.drawString(margin + 18, map_y + map_h - 50, "From notice row to parcel shape.")

    step_top = map_y + map_h - 76
    step_width = 110
    draw_step(pdf, "1", "Find", "Search by PID, civic address, or visible parcel.", margin + 18, step_top, step_width)
    draw_step(pdf, "2", "Compare", "View boundaries, roads, water, aerial imagery, and context.", margin + 135, step_top, step_width)
    draw_step(pdf, "3", "Verify", "Return to the dated municipal notice and current records.", margin + 252, step_top, step_width)

    pdf.setFillColor(INK)
    pdf.setFont("Helvetica-Bold", 8)
    pdf.drawString(margin + 18, map_y + 26, "NO OWNER NAMES")
    pdf.drawString(margin + 122, map_y + 26, "LOCATION STAYS IN YOUR BROWSER")

    qr_size = 104
    qr_x = page_width - margin - qr_size - 18
    qr_y = map_y + 46
    draw_qr(pdf, MAP_URL, qr_x, qr_y, qr_size)
    pdf.setFillColor(INK)
    pdf.setFont("Helvetica-Bold", 7.2)
    pdf.drawCentredString(qr_x + qr_size / 2, qr_y - 12, "SCAN TO OPEN THE LIVE MAP")
    pdf.setFillColor(MID)
    pdf.setFont("Helvetica", 5.8)
    pdf.drawCentredString(qr_x + qr_size / 2, qr_y - 23, "kinnokilabs.com/apps/nsmarksthespot/map/")
    pdf.linkURL(MAP_URL, (qr_x, qr_y - 27, qr_x + qr_size, qr_y), relative=0)

    # Guide card.
    guide_y = 204
    guide_h = 156
    pdf.setStrokeColor(INK)
    pdf.setFillColor(PAPER)
    pdf.roundRect(margin, guide_y, content_width, guide_h, 8, stroke=1, fill=1)
    draw_upper_label(pdf, "02 / Go beyond the packet", margin + 18, guide_y + guide_h - 24, 6.8, INK)
    pdf.setFillColor(INK)
    pdf.setFont("Helvetica-Bold", 16)
    pdf.drawString(margin + 18, guide_y + guide_h - 48, "One guide. Three ways to learn.")
    draw_paragraph(
        pdf,
        "<b>Beyond the Tax-Sale Packet</b> is an illustrated, spoken-first guide to how Nova Scotia "
        "municipal tax sales work and how to research carefully. The book is the source work; it "
        "will also become an audiobook and a video edition.",
        margin + 18,
        guide_y + guide_h - 64,
        286,
        70,
        CARD_BODY,
    )
    pdf.setFillColor(MID)
    pdf.setFont("Helvetica", 6.7)
    pdf.drawString(margin + 18, guide_y + 18, "Development details: kinnokilabs.com/apps/nsmarksthespot/")
    pdf.linkURL(GUIDE_URL, (margin + 18, guide_y + 14, margin + 300, guide_y + 28), relative=0)

    formats_x = 356
    draw_format(pdf, "BOOK", "In development", formats_x, guide_y + guide_h - 54, 172)
    draw_format(pdf, "AUDIOBOOK", "Planned from the book", formats_x, guide_y + guide_h - 92, 172)
    draw_format(pdf, "VIDEO", "Planned from the book", formats_x, guide_y + guide_h - 130, 172)

    # Trust boundary.
    boundary_y = 91
    boundary_h = 94
    pdf.setFillColor(INK)
    pdf.roundRect(margin, boundary_y, content_width, boundary_h, 8, stroke=0, fill=1)
    draw_upper_label(pdf, "The useful boundary", margin + 18, boundary_y + boundary_h - 23, 6.8, PAPER)
    pdf.setFillColor(PAPER)
    pdf.setFont("Helvetica-Bold", 15)
    pdf.drawString(margin + 18, boundary_y + boundary_h - 47, "A map can tell you where. It cannot tell you whether.")
    boundary_style = paragraph_style("BoundaryLight", fontSize=7.7, leading=10.2, textColor=PAPER)
    draw_paragraph(
        pdf,
        "Mapped boundaries are not a survey. A notice is not a promise that a property remains in "
        "the sale. Neither the map nor the guide proves access, title, condition, value, possession, "
        "insurance, financing, or buildability. Verify the current municipal source and ask the "
        "right qualified professional.",
        margin + 18,
        boundary_y + boundary_h - 58,
        content_width - 36,
        42,
        boundary_style,
    )

    # Footer.
    pdf.setFillColor(INK)
    pdf.setFont("Helvetica-Bold", 7.2)
    pdf.drawString(margin, 60, "KINNOKI LABS")
    pdf.setFillColor(MID)
    pdf.setFont("Helvetica", 6.5)
    pdf.drawString(margin, 47, "Educational tools - not legal, tax, investment, surveying, appraisal, environmental, planning, or construction advice.")
    pdf.setFillColor(INK)
    pdf.setFont("Helvetica-Bold", 7.2)
    footer_url = "kinnokilabs.com/apps/nsmarksthespot/"
    footer_width = stringWidth(footer_url, "Helvetica-Bold", 7.2)
    pdf.drawString(page_width - margin - footer_width, 60, footer_url)
    pdf.linkURL(GUIDE_URL, (page_width - margin - footer_width, 55, page_width - margin, 70), relative=0)

    pdf.showPage()
    pdf.save()


if __name__ == "__main__":
    build_pdf()
    print(OUTPUT)
