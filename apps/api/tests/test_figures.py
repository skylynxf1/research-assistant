"""Figure and table region detection - the primary backend (plan deviation 2).

The bar these tests encode is spec section 11: a crop that cuts off an axis label is
useless (IoU > 0.8), and precision beats recall everywhere - detecting nothing is better
than detecting a region that swallows body text.
"""

from __future__ import annotations

from pathlib import Path

import fitz
import pytest

from extract.figures import detect_assets
from extract.geometry import iou, normalize_rect

from .conftest import PAGE_H, PAGE_W, PAPER_FIGURE_RECT


@pytest.fixture(scope="module")
def assets(paper_pdf: Path):
    doc = fitz.open(str(paper_pdf))
    found, _warnings = detect_assets(doc)
    doc.close()
    return {a.asset_id: a for a in found}


def test_finds_the_figure_and_the_table(assets) -> None:
    assert set(assets) == {"fig-1", "tab-1"}


def test_figure_region_matches_the_drawing(assets) -> None:
    """Spec section 11: IoU > 0.8 against the true region."""
    expected = normalize_rect(PAPER_FIGURE_RECT, PAGE_W, PAGE_H)
    assert iou(assets["fig-1"].bbox, expected) > 0.8


def test_figure_region_excludes_body_text(assets) -> None:
    """The paragraph above the figure must not be swallowed into the crop.

    Body text ends around y=150pt (0.19 normalized); the figure starts at 300pt (0.379).
    """
    assert assets["fig-1"].bbox[1] > 0.25


def test_figure_caption_is_below_its_region(assets) -> None:
    fig = assets["fig-1"]
    assert fig.caption_bbox is not None
    assert fig.caption_bbox[1] >= fig.bbox[3] - 0.01


def test_caption_text_is_captured_and_normalized(assets) -> None:
    assert assets["fig-1"].caption == "Figure 1: Overview of the proposed architecture."


def test_caption_is_not_cropped_into_the_image(assets) -> None:
    """Spec section 6 stage 3: the caption is stored as text, never rasterized."""
    fig = assets["fig-1"]
    assert fig.bbox[3] <= fig.caption_bbox[1] + 0.01


def test_table_region_is_below_its_caption(assets) -> None:
    """Table captions sit above their body, the opposite of figures."""
    table = assets["tab-1"]
    assert table.bbox[1] >= table.caption_bbox[3] - 0.01


def test_table_region_excludes_the_following_paragraph(assets) -> None:
    """Rows end near y=180pt (0.227); the next paragraph starts at 300pt (0.379)."""
    assert assets["tab-1"].bbox[3] < 0.35


def test_pages_are_zero_based(assets) -> None:
    assert assets["fig-1"].page == 0
    assert assets["tab-1"].page == 1


def test_degenerate_regions_are_rejected(tmp_path: Path) -> None:
    """A caption with no detectable region yields no asset, not an empty crop.

    Precision-first: rendering nothing beats rendering a blank box.
    """
    doc = fitz.open()
    page = doc.new_page(width=PAGE_W, height=PAGE_H)
    page.insert_text((90.0, 400.0), "Figure 9: A caption with nothing above it.", fontsize=9)
    path = tmp_path / "empty.pdf"
    doc.save(str(path))
    doc.close()

    doc = fitz.open(str(path))
    found, warnings = detect_assets(doc)
    doc.close()

    assert found == []
    assert any("fig-9" in w for w in warnings)


def test_subfigure_records_its_parent(assets) -> None:
    assert assets["fig-1"].parent_id is None


def test_detects_a_table_made_of_words_not_numbers(tmp_path: Path) -> None:
    """Attention Is All You Need's Table 1 is prose-shaped: 39 words, wide, no digits.

    Width and word count cannot separate it from a paragraph. What can is the column
    structure - a table line has several large horizontal gaps, a justified paragraph
    has none.
    """
    doc = fitz.open()
    page = doc.new_page(width=PAGE_W, height=PAGE_H)
    page.insert_text((90.0, 100.0), "Table 1: Maximum path lengths per layer type.", fontsize=9)
    for i, row in enumerate(
        [
            "Layer Type              Complexity per Layer          Maximum Path Length",
            "Self-Attention          O(n  d)                       O(1)",
            "Recurrent               O(n  d)                       O(n)",
            "Convolutional           O(k  n  d)                    O(logk(n))",
        ]
    ):
        page.insert_text((90.0, 124.0 + i * 15.0), row, fontsize=9)
    for i, line in enumerate(
        [
            "As noted in the table, self-attention layers connect all positions with a",
            "constant number of sequentially executed operations, whereas a recurrent",
            "layer requires a number of sequential operations that grows with length.",
        ]
    ):
        page.insert_text((90.0, 200.0 + i * 13.0), line, fontsize=10)
    path = tmp_path / "wordy_table.pdf"
    doc.save(str(path))
    doc.close()

    doc = fitz.open(str(path))
    found, warnings = detect_assets(doc)
    doc.close()

    assets = {a.asset_id: a for a in found}
    assert "tab-1" in assets, f"table was dropped; warnings: {warnings}"
    # Rows end at ~172pt, the paragraph starts at ~192pt. 192/792 = 0.242.
    assert assets["tab-1"].bbox[3] < 0.24


def test_figure_region_includes_labels_just_outside_the_drawing(tmp_path: Path) -> None:
    """Spec section 11: a crop that cuts off an axis label is useless.

    Found by eye on ResNet's Figure 2, whose "x" input label sits just above the drawn
    box and came out sliced in half.
    """
    doc = fitz.open()
    page = doc.new_page(width=PAGE_W, height=PAGE_H)
    for i, line in enumerate(
        [
            "We reformulate the layers as learning residual functions with reference to",
            "the layer inputs, rather than learning unreferenced functions outright.",
        ]
    ):
        page.insert_text((90.0, 120.0 + i * 13.0), line, fontsize=10)
    page.insert_text((240.0, 295.0), "x", fontsize=9)  # label above the drawing
    page.draw_rect(fitz.Rect(150.0, 300.0, 400.0, 500.0), color=(0, 0, 0))
    page.insert_text((240.0, 515.0), "relu", fontsize=9)  # label below the drawing
    page.insert_text((90.0, 545.0), "Figure 2. Residual learning: a building block.", fontsize=9)
    path = tmp_path / "labelled.pdf"
    doc.save(str(path))
    doc.close()

    doc = fitz.open(str(path))
    found, _ = detect_assets(doc)
    doc.close()

    figure = {a.asset_id: a for a in found}["fig-2"]
    # The "x" baseline is at 295pt, so its top is near 288pt. 288/792 = 0.364.
    assert figure.bbox[1] < 0.37, "label above the drawing was cut off"
    # "relu" sits at 515pt, below the box. 515/792 = 0.650.
    assert figure.bbox[3] > 0.64, "label below the drawing was cut off"
    # ...but the paragraph at the top of the page must still be excluded.
    assert figure.bbox[1] > 0.2


def test_table_region_stops_at_a_section_heading(tmp_path: Path) -> None:
    """A heading is short, so the body-prose rule does not stop a region at one.

    Found by eye: the crop of Attention's Table 1 came out correct except that it had
    "3.5 Positional Encoding" tacked on underneath.
    """
    doc = fitz.open()
    page = doc.new_page(width=PAGE_W, height=PAGE_H)
    page.insert_text((90.0, 100.0), "Table 1: Complexity per layer type.", fontsize=9)
    for i, row in enumerate(
        [
            "Layer Type          Complexity      Path Length",
            "Self-Attention      O(n  d)         O(1)",
            "Recurrent           O(n  d)         O(n)",
        ]
    ):
        page.insert_text((90.0, 124.0 + i * 15.0), row, fontsize=9)
    page.insert_text((90.0, 190.0), "3.5 Positional Encoding", fontsize=11)
    for i, line in enumerate(
        [
            "Since our model contains no recurrence, we inject information about the",
            "relative position of the tokens in the sequence using fixed encodings.",
        ]
    ):
        page.insert_text((90.0, 215.0 + i * 13.0), line, fontsize=10)
    path = tmp_path / "heading_after_table.pdf"
    doc.save(str(path))
    doc.close()

    doc = fitz.open(str(path))
    found, warnings = detect_assets(doc)
    doc.close()

    assets = {a.asset_id: a for a in found}
    assert "tab-1" in assets, f"table was dropped; warnings: {warnings}"
    # Rows end at ~157pt; the heading sits at ~180pt. 180/792 = 0.227.
    assert assets["tab-1"].bbox[3] < 0.227


def test_table_region_stops_at_the_next_paragraph(tmp_path: Path) -> None:
    """In a real two-column paper the gap from the last row to the next paragraph is one
    line, not a wide margin. Growing through it makes every table run to the foot of the
    page, which is exactly what three real papers did before this test existed.
    """
    doc = fitz.open()
    page = doc.new_page(width=PAGE_W, height=PAGE_H)
    page.insert_text((90.0, 100.0), "Table 1: Error rates on the validation set.", fontsize=9)
    for i, row in enumerate(
        [
            "Model            Params      Top-1      Top-5",
            "ResNet-34        21.8M       21.53      5.60",
            "ResNet-50        25.6M       20.74      5.25",
        ]
    ):
        page.insert_text((90.0, 120.0 + i * 16.0), row, fontsize=9)
    # One line below the last row, exactly as a real paper sets it.
    for i, line in enumerate(
        [
            "The deeper network reduces top-1 error by a substantial margin on this",
            "benchmark, and we observe the same ordering across every other dataset.",
            "We therefore adopt it for all remaining experiments reported below.",
        ]
    ):
        page.insert_text((90.0, 180.0 + i * 13.0), line, fontsize=10)
    path = tmp_path / "dense.pdf"
    doc.save(str(path))
    doc.close()

    doc = fitz.open(str(path))
    found, _ = detect_assets(doc)
    doc.close()

    table = {a.asset_id: a for a in found}["tab-1"]
    # Rows end at ~152pt; the paragraph starts at ~172pt. 172/792 = 0.217.
    assert table.bbox[3] < 0.22
