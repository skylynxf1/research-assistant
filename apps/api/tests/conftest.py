"""Shared fixtures.

Tests build their PDFs with PyMuPDF rather than checking real papers into the repo:
fixture PDFs are gitignored (see /.gitignore), and a synthetic page lets a test assert
exact geometry instead of eyeballing a crop. Real papers are exercised by /eval.
"""

from __future__ import annotations

from pathlib import Path

import fitz
import pytest

PAGE_W = 612.0
PAGE_H = 792.0

# Top-left origin, in points. Deliberately in the TOP HALF of the page so the
# coordinate-conversion test has something unambiguous to assert (spec section 5).
FIGURE_RECT = (100.0, 80.0, 500.0, 300.0)
CAPTION_BASELINE = 320.0
BODY_BASELINE = 500.0


def _write_page(doc: fitz.Document, *, caption: str, body_lines: list[str]) -> None:
    page = doc.new_page(width=PAGE_W, height=PAGE_H)
    page.draw_rect(fitz.Rect(*FIGURE_RECT), color=(0, 0, 0), fill=(0.2, 0.4, 0.8))
    page.insert_text((100.0, CAPTION_BASELINE), caption, fontsize=9)
    for i, line in enumerate(body_lines):
        page.insert_text((100.0, BODY_BASELINE + i * 14.0), line, fontsize=10)


@pytest.fixture(scope="session")
def synthetic_pdf(tmp_path_factory: pytest.TempPathFactory) -> Path:
    """One page: a filled rect in the top half, its caption below, then body text."""
    doc = fitz.open()
    _write_page(
        doc,
        caption="Figure 1: A synthetic figure used by the geometry tests.",
        body_lines=[
            "The architecture is shown in Figure 1 and evaluated below.",
            "We compare against the baselines described in Section 2.",
        ],
    )
    path = tmp_path_factory.mktemp("pdfs") / "synthetic.pdf"
    doc.save(str(path))
    doc.close()
    return path
