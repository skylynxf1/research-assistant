"""Text-layer hazards, each one a real bug report (see AGENTS.md known edge cases).

This normalization is Python-side only, for captions and references. The client does its
own normalization for mentions; there is deliberately no shared contract between them
(plan deviation 1), so these two implementations are allowed to differ.
"""

from __future__ import annotations

from extract.textnorm import join_hyphenated, normalize


def test_normalize_expands_ligatures() -> None:
    assert normalize("The ﬁrst ﬂow") == "The first flow"


def test_normalize_unifies_dash_and_quote_variants() -> None:
    assert normalize("Figures 2–4") == "Figures 2-4"
    assert normalize("“quoted” and ’s") == '"quoted" and \'s'


def test_normalize_collapses_whitespace() -> None:
    assert normalize("Figure   1:\n  Overview") == "Figure 1: Overview"


def test_normalize_is_idempotent() -> None:
    once = normalize("The ﬁrst   “test”—2")
    assert normalize(once) == once


def test_join_hyphenated_rejoins_words_split_across_lines() -> None:
    assert join_hyphenated("as shown in Fig-\nure 3") == "as shown in Figure 3"


def test_join_hyphenated_keeps_genuine_hyphens() -> None:
    """A hyphen not at a line break is part of the word."""
    assert join_hyphenated("state-of-the-art results") == "state-of-the-art results"


def test_join_hyphenated_keeps_hyphen_before_capitalized_word() -> None:
    """'Transformer-\\nBase' is a compound, not a split word."""
    assert join_hyphenated("Transformer-\nBase model") == "Transformer-Base model"
