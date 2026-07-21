"""Distinguishing a typeset table from a paragraph.

figures.py seeds table regions from text blocks and uses paragraphs as barriers, so this
decision directly controls whether a table is found at all and where it stops.

The signal is column structure, not vocabulary: a table line has two or more gaps several
times wider than a space, while even fully justified prose stretches its spaces by well
under an em. Measuring against font height rather than against the line's own median gap
matters - in a three-column row *every* gap is wide, so a relative threshold sees no
outliers at all.
"""

from __future__ import annotations

from typing import Sequence

# A gap wider than this many times the font height is a column boundary, not a space.
# Justified text tops out near 0.5; real column gutters run to several multiples.
_GAP_TO_FONT_RATIO = 1.5
# Two boundaries means three columns. One is an indent or a right-aligned figure.
_MIN_COLUMN_GAPS = 2
_MIN_WORDS_PER_LINE = 3
# A header line of prose above aligned rows is normal, so require only a majority.
_MIN_TABULAR_LINE_FRACTION = 0.5
# Cells in one row rarely share an exact baseline; allow half a line of jitter.
_ROW_BAND_TOLERANCE = 0.5
# One line beside another is a marginal note. Two such rows is a table.
_MIN_ROWS = 2


def line_is_tabular(word_spans: Sequence[tuple[float, float]], font_height: float) -> bool:
    """True if the horizontal word positions of one line look like columns.

    `word_spans` is (x0, x1) per word, in any order.
    """
    if len(word_spans) < _MIN_WORDS_PER_LINE:
        return False

    spans = sorted(word_spans)
    threshold = max(font_height, 1.0) * _GAP_TO_FONT_RATIO
    gaps = sum(
        1 for a, b in zip(spans, spans[1:]) if b[0] - a[1] > threshold
    )
    return gaps >= _MIN_COLUMN_GAPS


def block_is_tabular(
    lines: Sequence[Sequence[tuple[float, float]]], font_height: float
) -> bool:
    """True if most of a block's multi-word lines are laid out in columns."""
    considered = [line for line in lines if len(line) >= _MIN_WORDS_PER_LINE]
    if not considered:
        return False
    tabular = sum(1 for line in considered if line_is_tabular(line, font_height))
    return tabular / len(considered) >= _MIN_TABULAR_LINE_FRACTION


def lines_share_rows(
    line_boxes: Sequence[tuple[float, float, float, float]], font_height: float
) -> bool:
    """True if the block's lines sit side by side in shared rows.

    The second table signature, and the one that matters most in practice: PyMuPDF emits
    one "line" per *cell*, not per row, so a table's columns show up as several lines
    occupying the same vertical band rather than as gaps inside a line.
    """
    if len(line_boxes) < _MIN_ROWS * 2:
        return False

    tolerance = max(font_height, 1.0) * _ROW_BAND_TOLERANCE
    centers = sorted((box[1] + box[3]) / 2.0 for box in line_boxes)

    bands: list[list[float]] = [[centers[0]]]
    for center in centers[1:]:
        if center - bands[-1][0] <= tolerance:
            bands[-1].append(center)
        else:
            bands.append([center])

    shared = [band for band in bands if len(band) >= 2]
    if len(shared) < _MIN_ROWS:
        return False
    return sum(len(band) for band in shared) / len(line_boxes) >= _MIN_TABULAR_LINE_FRACTION
