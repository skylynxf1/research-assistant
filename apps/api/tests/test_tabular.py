"""Telling a table apart from a paragraph.

Motivated by a real failure: Attention Is All You Need's Table 1 is one 39-word block,
59% of the page wide, with essentially no digits. Width, word count and digit density all
call it prose, and dropping it loses the paper's headline table.

What actually separates them is column structure. A table line has several gaps many
times wider than a space; a justified paragraph stretches its spaces a little and no
more. These are unit tests over raw geometry rather than over a synthetic PDF, because
PyMuPDF's block grouping differs between a hand-built page and a LaTeX-produced one -
an earlier synthetic fixture passed while the real paper still failed.
"""

from __future__ import annotations

from extract.tabular import block_is_tabular, line_is_tabular, lines_share_rows

FONT_HEIGHT = 10.0


def _prose_line() -> list[tuple[float, float]]:
    """Justified body text: word gaps a bit wider than a space, but uniform."""
    spans, x = [], 90.0
    for width in (38.0, 22.0, 46.0, 30.0, 52.0, 26.0, 41.0):
        spans.append((x, x + width))
        x += width + 5.5
    return spans


def _table_line() -> list[tuple[float, float]]:
    """Three columns on a grid, separated by wide runs of whitespace."""
    return [(90.0, 150.0), (240.0, 300.0), (420.0, 470.0)]


def test_prose_line_is_not_tabular() -> None:
    assert line_is_tabular(_prose_line(), FONT_HEIGHT) is False


def test_column_gaps_make_a_line_tabular() -> None:
    assert line_is_tabular(_table_line(), FONT_HEIGHT) is True


def test_stretched_justification_is_still_prose() -> None:
    """Full justification pads spaces; that must not read as a column boundary."""
    spans, x = [], 90.0
    for width in (38.0, 22.0, 46.0, 30.0):
        spans.append((x, x + width))
        x += width + 11.0  # about one em of padding
    assert line_is_tabular(spans, FONT_HEIGHT) is False


def test_a_single_wide_gap_is_not_enough() -> None:
    """One gap is an indent or a right-aligned page number, not a table."""
    assert line_is_tabular([(90.0, 150.0), (400.0, 460.0)], FONT_HEIGHT) is False


def test_short_lines_are_not_tabular() -> None:
    assert line_is_tabular([(90.0, 150.0)], FONT_HEIGHT) is False
    assert line_is_tabular([], FONT_HEIGHT) is False


def test_block_is_tabular_when_most_lines_are() -> None:
    """A header line of prose above three aligned rows is still a table."""
    assert block_is_tabular([_prose_line(), _table_line(), _table_line(), _table_line()],
                            FONT_HEIGHT) is True


def test_block_of_prose_is_not_tabular() -> None:
    assert block_is_tabular([_prose_line()] * 4, FONT_HEIGHT) is False


def test_one_tabular_line_does_not_carry_a_paragraph() -> None:
    assert block_is_tabular([_prose_line(), _prose_line(), _prose_line(), _table_line()],
                            FONT_HEIGHT) is False


# PyMuPDF splits a typeset table into one "line" per cell rather than one per row, so a
# table's columns never appear as gaps within a line. They appear as several lines
# sharing a vertical band. This is how Attention's Table 1 is actually laid out.


def _cells(rows: int, columns: int) -> list[tuple[float, float, float, float]]:
    return [
        (90.0 + column * 150.0, 120.0 + row * 16.0, 200.0 + column * 150.0, 130.0 + row * 16.0)
        for row in range(rows)
        for column in range(columns)
    ]


def test_cells_sharing_a_row_are_tabular() -> None:
    assert lines_share_rows(_cells(rows=4, columns=3), FONT_HEIGHT) is True


def test_stacked_prose_lines_do_not_share_rows() -> None:
    stacked = [(90.0, 120.0 + i * 14.0, 500.0, 132.0 + i * 14.0) for i in range(6)]
    assert lines_share_rows(stacked, FONT_HEIGHT) is False


def test_a_single_shared_row_is_not_a_table() -> None:
    """One line beside another is a float caption or a marginal note, not a table."""
    lines = [(90.0, 120.0, 200.0, 130.0), (300.0, 120.0, 400.0, 130.0)]
    lines += [(90.0, 140.0 + i * 14.0, 500.0, 152.0 + i * 14.0) for i in range(4)]
    assert lines_share_rows(lines, FONT_HEIGHT) is False


def test_slight_baseline_jitter_still_counts_as_one_row() -> None:
    """Cells in a row rarely share an exact baseline."""
    row = [(90.0, 120.0, 200.0, 130.0), (240.0, 121.5, 350.0, 131.5), (400.0, 119.0, 500.0, 129.0)]
    assert lines_share_rows(row + _cells(rows=2, columns=3), FONT_HEIGHT) is True
