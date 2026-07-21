"""The single coordinate conversion in this project (spec section 5).

Written before the implementation, per spec section 14. The bug this guards against is
converting twice: PyMuPDF hands back rects that are ALREADY top-left origin, so flipping
them "to fix the origin" silently mirrors every figure about the page's horizontal axis.
That renders plausibly and is very hard to spot by eye.
"""

from __future__ import annotations

from pathlib import Path

import fitz
import pytest

from extract.geometry import (
    denormalize_bbox,
    normalize_rect,
    pad_bbox,
    pdf_native_to_topleft,
)

from .conftest import FIGURE_RECT, PAGE_H, PAGE_W


def test_normalize_rect_scales_to_unit_square() -> None:
    bbox = normalize_rect((61.2, 79.2, 550.8, 316.8), PAGE_W, PAGE_H)
    assert bbox == pytest.approx((0.1, 0.1, 0.9, 0.4))


def test_figure_in_top_half_of_page_has_low_y0() -> None:
    """The assertion spec section 5 asks for by name."""
    bbox = normalize_rect(FIGURE_RECT, PAGE_W, PAGE_H)
    assert bbox[1] < 0.5


def test_pymupdf_rects_are_not_flipped(synthetic_pdf: Path) -> None:
    """Golden fixture: a drawing in the page's top half must stay in the top half.

    This is the test that catches a double conversion end to end.
    """
    doc = fitz.open(str(synthetic_pdf))
    page = doc[0]
    drawings = page.get_drawings()
    assert drawings, "fixture should contain at least one vector drawing"

    rect = max((d["rect"] for d in drawings), key=lambda r: r.get_area())
    bbox = normalize_rect(rect, page.rect.width, page.rect.height)
    doc.close()

    assert bbox[1] < 0.5, "figure drawn in the top half came back in the bottom half"
    assert bbox[3] < 0.5


def test_normalize_rect_clamps_to_the_page() -> None:
    """Drawings can bleed past the page box; a bbox outside [0,1] breaks the client."""
    bbox = normalize_rect((-20.0, -10.0, PAGE_W + 50, PAGE_H + 5), PAGE_W, PAGE_H)
    assert bbox == (0.0, 0.0, 1.0, 1.0)


def test_normalize_rect_orders_corners() -> None:
    """Some rects arrive with y0 > y1. The manifest contract is x0<=x1, y0<=y1."""
    bbox = normalize_rect((500.0, 300.0, 100.0, 80.0), PAGE_W, PAGE_H)
    assert bbox[0] < bbox[2]
    assert bbox[1] < bbox[3]


def test_pdf_native_to_topleft_flips_y() -> None:
    """Raw PDF coordinates are bottom-left origin. This is the ONLY flip in the codebase."""
    # A box 80pt tall sitting 692pt up from the bottom == 20pt down from the top.
    assert pdf_native_to_topleft((10.0, 692.0, 100.0, 772.0), PAGE_H) == pytest.approx(
        (10.0, 20.0, 100.0, 100.0)
    )


def test_denormalize_bbox_round_trips(synthetic_pdf: Path) -> None:
    bbox = normalize_rect(FIGURE_RECT, PAGE_W, PAGE_H)
    assert denormalize_bbox(bbox, PAGE_W, PAGE_H) == pytest.approx(FIGURE_RECT)


def test_pad_bbox_expands_and_clamps() -> None:
    assert pad_bbox((0.2, 0.2, 0.4, 0.4), 0.5) == pytest.approx((0.1, 0.1, 0.5, 0.5))
    assert pad_bbox((0.0, 0.0, 1.0, 1.0), 0.02) == (0.0, 0.0, 1.0, 1.0)
