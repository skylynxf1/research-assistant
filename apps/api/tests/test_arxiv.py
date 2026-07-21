"""arXiv id resolution (plan phase 2).

Two tiers, per the plan: read an explicit id out of the reference string, which is nearly
free and very common in AI papers, then fall back to a title search. The fallback accepts
only on high title similarity - a citation that opens the wrong paper is worse than one
that opens nothing (spec section 11).

Nothing here touches the network. The API client is exercised against a canned response.
"""

from __future__ import annotations

import pytest

from extract.arxiv import (
    find_arxiv_id,
    normalize_title,
    parse_search_response,
    pick_best_match,
    search_url,
)

_ATOM = """<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/abs/1706.03762v7</id>
    <title>Attention Is All You Need</title>
  </entry>
  <entry>
    <id>http://arxiv.org/abs/1409.0473v7</id>
    <title>Neural Machine Translation by Jointly Learning to Align and Translate</title>
  </entry>
</feed>
"""


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("Attention is all you need. arXiv:1706.03762, 2017.", "1706.03762"),
        ("arXiv preprint arXiv:1607.06450v2, 2016.", "1607.06450v2"),
        ("Available at arxiv.org/abs/2401.12345", "2401.12345"),
        ("https://arxiv.org/pdf/1512.03385v1", "1512.03385v1"),
        ("An old one, arXiv:cs/0501001", "cs/0501001"),
        ("No preprint here, just a NeurIPS citation, 2017.", None),
        ("", None),
    ],
)
def test_finds_explicit_arxiv_ids(text: str, expected: str | None) -> None:
    assert find_arxiv_id(text) == expected


def test_search_url_identifies_the_client_and_limits_results() -> None:
    """Spec section 6 stage 1: be polite to arXiv or get blocked mid-build."""
    url = search_url("Attention Is All You Need", limit=5)
    assert url.startswith("https://export.arxiv.org/api/query")
    assert "max_results=5" in url
    assert "Attention" in url


def test_parses_the_atom_feed() -> None:
    results = parse_search_response(_ATOM)
    assert results == [
        ("1706.03762v7", "Attention Is All You Need"),
        ("1409.0473v7", "Neural Machine Translation by Jointly Learning to Align and Translate"),
    ]


def test_normalize_title_ignores_case_and_punctuation() -> None:
    assert normalize_title("Attention Is All You Need!") == normalize_title(
        "attention is all you need"
    )


def test_picks_a_match_only_on_high_similarity() -> None:
    results = parse_search_response(_ATOM)
    assert pick_best_match("attention is all you need", results) == "1706.03762v7"


def test_rejects_a_loose_match() -> None:
    """A near-miss must resolve to nothing rather than open the wrong paper."""
    results = parse_search_response(_ATOM)
    assert pick_best_match("A survey of attention mechanisms", results) is None


def test_rejects_an_empty_title() -> None:
    assert pick_best_match("", parse_search_response(_ATOM)) is None
