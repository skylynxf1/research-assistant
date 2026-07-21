"""Section outline detection, for the reader's outline nav (spec section 8)."""

from __future__ import annotations

from pathlib import Path

import fitz
import pytest

from extract.sections import detect_sections

from .conftest import PAGE_H, PAGE_W


@pytest.fixture(scope="module")
def sectioned_pdf(tmp_path_factory: pytest.TempPathFactory) -> Path:
    doc = fitz.open()
    page = doc.new_page(width=PAGE_W, height=PAGE_H)
    page.insert_text((90.0, 100.0), "1 Introduction", fontsize=13)
    page.insert_text((90.0, 130.0), "Reading a paper forces constant context loss.", fontsize=10)
    page.insert_text((90.0, 200.0), "2 Related Work", fontsize=13)
    page.insert_text((90.0, 230.0), "Prior systems focus on citations rather than figures.", fontsize=10)
    page.insert_text((90.0, 300.0), "2.1 Reference managers", fontsize=11)
    page.insert_text((90.0, 330.0), "Figure preview has been requested for years.", fontsize=10)
    path = tmp_path_factory.mktemp("pdfs") / "sectioned.pdf"
    doc.save(str(path))
    doc.close()
    return path


@pytest.fixture(scope="module")
def sections(sectioned_pdf: Path):
    doc = fitz.open(str(sectioned_pdf))
    found = detect_sections(doc)
    doc.close()
    return found


def test_finds_numbered_headings(sections) -> None:
    assert [s.title for s in sections] == [
        "1 Introduction",
        "2 Related Work",
        "2.1 Reference managers",
    ]


def test_nesting_depth_comes_from_the_number(sections) -> None:
    assert [s.level for s in sections] == [1, 1, 2]


def test_pages_are_zero_based(sections) -> None:
    assert all(s.page == 0 for s in sections)


def test_a_year_prefixed_line_is_not_a_heading() -> None:
    """ACL bibliography lines begin "2018. Title of the paper here."

    Treating one as a section heading terminated BERT's reference list after a single
    line, yielding zero references. Section numbers are one or two digits; years are four.
    """
    from extract.sections import looks_like_heading

    assert looks_like_heading("2018. Contextual string embeddings for sequence") is False
    assert looks_like_heading("3.5 Positional Encoding") is True
    assert looks_like_heading("10 Conclusion") is True


def test_prose_is_not_mistaken_for_a_heading(sections) -> None:
    """Body sentences are long and start lowercase or mid-sentence; headings are short."""
    assert not any("context loss" in s.title for s in sections)
