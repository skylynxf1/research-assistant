"""Normalizing whatever the user pastes into an arXiv id (plan phase 3)."""

from __future__ import annotations

import pytest

from extract.arxiv import normalize_arxiv_id, pdf_url


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("1706.03762", "1706.03762"),
        ("1706.03762v7", "1706.03762v7"),
        ("arXiv:1706.03762", "1706.03762"),
        ("https://arxiv.org/abs/1706.03762", "1706.03762"),
        ("https://arxiv.org/pdf/1706.03762v7", "1706.03762v7"),
        ("http://arxiv.org/abs/cs/0501001", "cs/0501001"),
        ("  1706.03762  ", "1706.03762"),
    ],
)
def test_normalizes_accepted_forms(raw: str, expected: str) -> None:
    assert normalize_arxiv_id(raw) == expected


@pytest.mark.parametrize("raw", ["", "not an id", "https://example.com/paper.pdf", "12.34"])
def test_rejects_everything_else(raw: str) -> None:
    assert normalize_arxiv_id(raw) is None


def test_pdf_url_points_at_the_export_endpoint_over_https() -> None:
    url = pdf_url("1706.03762v7")
    assert url == "https://arxiv.org/pdf/1706.03762v7"
