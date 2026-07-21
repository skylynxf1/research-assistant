"""Caption-anchored figure and table region detection.

This is the primary backend, not a fallback (plan deviation 2): PDFFigures2 needs a JVM
and Docling pulls multi-GB torch models, neither of which fits the budget. Working from
PyMuPDF's vector-drawing and image data also handles TikZ-drawn figures, which spec D2
calls out as the common case in ML papers.

The shape of the heuristic:

    caption anchor  ->  search the band on the caption's content side
                    ->  cluster graphics/rows separated by less than a line gap
                    ->  absorb text that sits inside the cluster (axis labels)
                    ->  reject anything degenerate

Rejection is a feature. Spec section 11 wants precision over recall everywhere: a caption
with no defensible region produces a warning and no asset, never an empty crop.
"""

from __future__ import annotations

from dataclasses import dataclass
from statistics import median

import fitz

from .captions import CaptionAnchor, parse_caption_start
from .geometry import BBox, area, intersection_area, normalize_rect
from .sections import looks_like_heading
from .tabular import block_is_tabular, lines_share_rows
from .textnorm import clean_block_text

# Figures caption below their content; tables and algorithms caption above theirs.
_CONTENT_ABOVE_CAPTION = {"figure": True, "table": False, "algorithm": False, "equation": True}

# Two pieces of one figure (a plot and its legend) sit closer together than a figure sits
# to the surrounding prose. Expressed as a fraction of page height.
_CLUSTER_GAP = 0.045
# Do not look further from the caption than this: a figure is never a whole page away.
_SEARCH_WINDOW = 0.6
# Spec-plan gate: a region smaller than this is degenerate.
_MIN_AREA = 0.01
# ...or one that has swallowed this much of a paragraph.
_MAX_BODY_OVERLAP = 0.3
# A text block this wide with this many words is prose, not part of a figure.
_BODY_MIN_WIDTH = 0.4
_BODY_MIN_WORDS = 12
# How far outside its drawn extent a figure may reach to collect a label. Under one line
# height, so it can never step into the surrounding prose.
_LABEL_GAP = 0.012


@dataclass(frozen=True)
class DetectedAsset:
    asset_id: str
    kind: str
    label: str
    number: str
    page: int
    bbox: BBox
    caption: str
    caption_bbox: BBox
    parent_id: str | None


@dataclass(frozen=True)
class _Block:
    bbox: BBox
    text: str
    is_tabular: bool = False

    @property
    def words(self) -> int:
        return len(self.text.split())

    @property
    def is_body_prose(self) -> bool:
        """Wide, wordy, and not laid out in columns.

        The column test is what keeps a textual table (Attention's Table 1: 39 words,
        59% of the page wide, no digits) from being classified as a paragraph and
        excluded from its own region.
        """
        if self.is_tabular:
            return False
        return (
            self.bbox[2] - self.bbox[0]
        ) >= _BODY_MIN_WIDTH and self.words >= _BODY_MIN_WORDS


def _union(a: BBox, b: BBox) -> BBox:
    return (min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3]))


def _x_overlaps(a: BBox, b: BBox, margin: float = 0.05) -> bool:
    """Horizontal overlap, the cheap stand-in for column detection.

    In a two-column paper a right-column figure never overlaps a left-column caption, so
    this keeps clusters from spanning the gutter without a real column model.
    """
    return a[0] - margin < b[2] and a[2] + margin > b[0]


def _vertical_gap(a: BBox, b: BBox) -> float:
    if a[3] < b[1]:
        return b[1] - a[3]
    if b[3] < a[1]:
        return a[1] - b[3]
    return 0.0


def _page_graphics(page: fitz.Page) -> list[BBox]:
    """Vector drawings and raster images, normalized. The raw material of a figure."""
    w, h = page.rect.width, page.rect.height
    rects: list[BBox] = []
    for drawing in page.get_drawings():
        rect = drawing["rect"]
        if rect.is_empty or rect.is_infinite:
            continue
        rects.append(normalize_rect(rect, w, h))
    for image in page.get_images(full=True):
        for rect in page.get_image_rects(image[0]):
            if not rect.is_empty:
                rects.append(normalize_rect(rect, w, h))
    return rects


def _tabular_blocks(page: fitz.Page) -> set[int]:
    """Block numbers whose lines are laid out in columns."""
    lines: dict[tuple[int, int], list[tuple[float, float, float, float]]] = {}
    heights: dict[int, list[float]] = {}
    for x0, y0, x1, y1, _word, block_no, line_no, _word_no in page.get_text("words"):
        lines.setdefault((block_no, line_no), []).append((x0, y0, x1, y1))
        heights.setdefault(block_no, []).append(y1 - y0)

    spans_by_block: dict[int, list[list[tuple[float, float]]]] = {}
    boxes_by_block: dict[int, list[tuple[float, float, float, float]]] = {}
    for (block_no, _line_no), words in lines.items():
        spans_by_block.setdefault(block_no, []).append([(w[0], w[2]) for w in words])
        boxes_by_block.setdefault(block_no, []).append(
            (
                min(w[0] for w in words),
                min(w[1] for w in words),
                max(w[2] for w in words),
                max(w[3] for w in words),
            )
        )

    tabular = set()
    for block_no, block_lines in spans_by_block.items():
        font_height = median(heights[block_no])
        # Either signature is enough: columns within a line, or cells sharing a row.
        if block_is_tabular(block_lines, font_height) or lines_share_rows(
            boxes_by_block[block_no], font_height
        ):
            tabular.add(block_no)
    return tabular


def _page_blocks(page: fitz.Page) -> list[_Block]:
    w, h = page.rect.width, page.rect.height
    tabular = _tabular_blocks(page)
    blocks: list[_Block] = []
    for x0, y0, x1, y1, text, block_no, block_type in page.get_text("blocks"):
        if block_type != 0:
            continue
        cleaned = clean_block_text(text)
        if cleaned:
            blocks.append(
                _Block(
                    normalize_rect((x0, y0, x1, y1), w, h),
                    cleaned,
                    is_tabular=block_no in tabular,
                )
            )
    return blocks


def _blocked(a: BBox, b: BBox, barriers: list[BBox]) -> bool:
    """True if a barrier sits in the vertical gap between `a` and `b`.

    Without this, a region grows *through* a paragraph to reach whatever is on the far
    side, which in a dense two-column layout means every table runs to the foot of the
    page. The gap threshold alone cannot prevent it: the space between a table's last row
    and the next paragraph is one line, the same as the space between two rows.
    """
    low, high = (a[3], b[1]) if a[3] <= b[1] else (b[3], a[1])
    if high <= low:
        return False
    return any(
        barrier[3] > low and barrier[1] < high and _x_overlaps(barrier, a, margin=0.0)
        for barrier in barriers
    )


def _cluster(
    seeds: list[BBox], caption: BBox, above: bool, barriers: list[BBox]
) -> BBox | None:
    """Grow a region outward from whichever candidate sits closest to the caption."""
    if above:
        candidates = [r for r in seeds if r[3] <= caption[1] + 0.005]
    else:
        candidates = [r for r in seeds if r[1] >= caption[3] - 0.005]
    candidates = [
        r
        for r in candidates
        if _x_overlaps(r, caption)
        and _vertical_gap(r, caption) <= _SEARCH_WINDOW
        and not _blocked(r, caption, barriers)
    ]
    if not candidates:
        return None

    candidates.sort(key=lambda r: _vertical_gap(r, caption))
    region = candidates[0]
    remaining = candidates[1:]
    grew = True
    while grew:
        grew = False
        for rect in list(remaining):
            if (
                _vertical_gap(rect, region) <= _CLUSTER_GAP
                and _x_overlaps(rect, region)
                and not _blocked(rect, region, barriers)
            ):
                region = _union(region, rect)
                remaining.remove(rect)
                grew = True
    return region


def _absorb_inner_text(region: BBox, blocks: list[_Block], barriers: list[BBox]) -> BBox:
    """Pull in labels that belong to the figure but fall outside its drawn extent.

    Two cases: tick and legend text inside the plotted area, and axis or input labels
    sitting just beyond the drawing's edge. The second is why this is not simply a
    containment test - the label is outside the region by definition.
    """
    grew = True
    while grew:
        grew = False
        for block in blocks:
            block_area = area(block.bbox)
            if block_area <= 0 or block.is_body_prose:
                continue
            if intersection_area(region, block.bbox) / block_area >= 0.7:
                inside = True
            else:
                # Adjacent, overlapping horizontally, and not something that bounds a
                # region. The margin is deliberately under a line height so this cannot
                # walk into the surrounding prose.
                inside = (
                    _vertical_gap(block.bbox, region) <= _LABEL_GAP
                    and _x_overlaps(block.bbox, region, margin=0.0)
                    and not _blocked(block.bbox, region, barriers)
                )
            if inside:
                merged = _union(region, block.bbox)
                if merged != region:
                    region = merged
                    grew = True
    return region


def _swallows_prose(region: BBox, blocks: list[_Block]) -> bool:
    for block in blocks:
        block_area = area(block.bbox)
        if block_area <= 0 or not block.is_body_prose:
            continue
        if intersection_area(region, block.bbox) / block_area > _MAX_BODY_OVERLAP:
            return True
    return False


def _best_candidate(
    candidates: list[tuple[CaptionAnchor, _Block]],
) -> tuple[CaptionAnchor, _Block]:
    """Break ties between blocks claiming the same label.

    A block opening "Figure 1:" beats a sentence opening "Figure 1 shows that ...", which
    is why captions.py reports the delimiter rather than guessing.
    """
    return max(candidates, key=lambda c: (c[0].has_delimiter, len(c[1].text)))


def detect_assets(doc: fitz.Document) -> tuple[list[DetectedAsset], list[str]]:
    """Detect every figure/table/algorithm in the document.

    Returns the assets plus warnings for captions that could not be resolved to a region.
    """
    warnings: list[str] = []
    # asset_id -> (anchor, caption block, page index, page blocks, page graphics)
    claims: dict[str, tuple[CaptionAnchor, _Block, int, list[_Block], list[BBox]]] = {}

    for page_index in range(doc.page_count):
        page = doc[page_index]
        blocks = _page_blocks(page)
        graphics = _page_graphics(page)
        for block in blocks:
            anchor = parse_caption_start(block.text)
            if anchor is None:
                continue
            existing = claims.get(anchor.asset_id)
            if existing is not None:
                keep = _best_candidate(
                    [(existing[0], existing[1]), (anchor, block)]
                )
                if keep[1] is existing[1]:
                    continue
            claims[anchor.asset_id] = (anchor, block, page_index, blocks, graphics)

    assets: list[DetectedAsset] = []
    for asset_id, (anchor, caption_block, page_index, blocks, graphics) in claims.items():
        above = _CONTENT_ABOVE_CAPTION[anchor.kind]
        other_blocks = [b for b in blocks if b is not caption_block]
        # Prose, other captions and section headings bound a region; a region may never
        # grow across one. Headings are exempted for tabular blocks, since a numeric row
        # can superficially resemble a numbered heading.
        barriers = [
            b.bbox
            for b in other_blocks
            if b.is_body_prose
            or parse_caption_start(b.text) is not None
            or (not b.is_tabular and looks_like_heading(b.text))
        ]
        # Figures are drawn; tables are typeset. Seed each from the right material.
        if anchor.kind in ("figure", "equation"):
            seeds = graphics
        else:
            seeds = [b.bbox for b in other_blocks if b.bbox not in barriers]
        region = _cluster(seeds, caption_block.bbox, above, barriers)

        if region is None:
            warnings.append(
                f"page {page_index}: no region found for {asset_id}, asset dropped"
            )
            continue
        if anchor.kind in ("figure", "equation"):
            region = _absorb_inner_text(region, other_blocks, barriers)
        if area(region) < _MIN_AREA:
            warnings.append(
                f"page {page_index}: region for {asset_id} is degenerate "
                f"({area(region):.4f} of the page), asset dropped"
            )
            continue
        if _swallows_prose(region, other_blocks):
            warnings.append(
                f"page {page_index}: region for {asset_id} overlaps body text, asset dropped"
            )
            continue

        assets.append(
            DetectedAsset(
                asset_id=asset_id,
                kind=anchor.kind,
                label=anchor.label,
                number=anchor.number,
                page=page_index,
                bbox=region,
                caption=caption_block.text,
                caption_bbox=caption_block.bbox,
                parent_id=anchor.parent_id,
            )
        )

    assets.sort(key=lambda a: (a.page, a.bbox[1], a.bbox[0]))
    return assets, warnings
