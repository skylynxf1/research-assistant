"""The single place coordinates are converted (spec section 5).

Three coordinate systems are in play:

1. Raw PDF native  - origin bottom-left, y up, in points.
2. PyMuPDF         - origin TOP-LEFT, y down, in points. Everything `fitz` returns
                     (page.rect, get_drawings, get_text blocks, get_image_rects) is
                     already in this system.
3. The manifest    - origin top-left, normalized to [0,1].

So the usual path (PyMuPDF -> manifest) is a scale, NOT a flip. `pdf_native_to_topleft`
is the only flip in the codebase and exists for coordinates read out of raw PDF
structures. Calling it on a `fitz` rect is the double-conversion bug the tests guard.
"""

from __future__ import annotations

from typing import Sequence

BBox = tuple[float, float, float, float]


def _clamp_unit(value: float) -> float:
    return 0.0 if value < 0.0 else 1.0 if value > 1.0 else value


def normalize_rect(
    rect: Sequence[float], page_width: float, page_height: float
) -> BBox:
    """PyMuPDF rect (points, top-left origin) -> normalized top-left bbox in [0,1].

    Corners are ordered and the result clamped to the page: drawings routinely bleed
    past the page box, and an out-of-range bbox breaks the client's crop positioning.
    """
    x0, y0, x1, y1 = (float(rect[0]), float(rect[1]), float(rect[2]), float(rect[3]))
    if x0 > x1:
        x0, x1 = x1, x0
    if y0 > y1:
        y0, y1 = y1, y0
    return (
        _clamp_unit(x0 / page_width),
        _clamp_unit(y0 / page_height),
        _clamp_unit(x1 / page_width),
        _clamp_unit(y1 / page_height),
    )


def denormalize_bbox(bbox: BBox, page_width: float, page_height: float) -> BBox:
    """Normalized bbox -> PyMuPDF points, for cropping."""
    return (
        bbox[0] * page_width,
        bbox[1] * page_height,
        bbox[2] * page_width,
        bbox[3] * page_height,
    )


def pdf_native_to_topleft(rect: Sequence[float], page_height: float) -> BBox:
    """Raw PDF bottom-left-origin rect -> top-left origin. Still in points.

    The only y-flip in this codebase. Do not apply it to anything `fitz` returned.
    """
    x0, y0, x1, y1 = (float(rect[0]), float(rect[1]), float(rect[2]), float(rect[3]))
    return (x0, page_height - y1, x1, page_height - y0)


def pad_bbox(bbox: BBox, fraction: float) -> BBox:
    """Grow a normalized bbox by a fraction of its own size, clamped to the page.

    Used for the 2% crop padding (spec section 6 stage 3) so a crop does not shave
    an axis label off the edge of a plot.
    """
    dx = (bbox[2] - bbox[0]) * fraction
    dy = (bbox[3] - bbox[1]) * fraction
    return (
        _clamp_unit(bbox[0] - dx),
        _clamp_unit(bbox[1] - dy),
        _clamp_unit(bbox[2] + dx),
        _clamp_unit(bbox[3] + dy),
    )


def area(bbox: BBox) -> float:
    return max(0.0, bbox[2] - bbox[0]) * max(0.0, bbox[3] - bbox[1])


def intersection_area(a: BBox, b: BBox) -> float:
    return area(
        (max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3]))
    )


def iou(a: BBox, b: BBox) -> float:
    """Intersection over union. Used by the figure-region eval (spec section 11)."""
    inter = intersection_area(a, b)
    union = area(a) + area(b) - inter
    return 0.0 if union <= 0.0 else inter / union
