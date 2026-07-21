"""Caption anchor detection - the primary figure backend's entry point (plan deviation 2)."""

from __future__ import annotations

import pytest

from extract.captions import parse_caption_start


@pytest.mark.parametrize(
    ("line", "kind", "number"),
    [
        ("Figure 1: Overview of the proposed architecture.", "figure", "1"),
        ("Fig. 2 Results on ImageNet.", "figure", "2"),
        ("Figure 3a: Encoder detail.", "figure", "3a"),
        ("Table 4: Ablation study.", "table", "4"),
        ("Algorithm 1 Training loop", "algorithm", "1"),
        ("Figure S3: Additional samples.", "figure", "S3"),
        ("Figure A.1: Appendix overview.", "figure", "A.1"),
        ("FIGURE 5: Shouted caption.", "figure", "5"),
    ],
)
def test_parses_caption_openers(line: str, kind: str, number: str) -> None:
    anchor = parse_caption_start(line)
    assert anchor is not None
    assert (anchor.kind, anchor.number) == (kind, number)


@pytest.mark.parametrize(
    "line",
    [
        "As shown in Figure 1, the model converges.",
        "We report results in Table 2 below.",
        "Figures 2 and 3 show the ablations.",
        "Section 3 describes the method.",
        "",
        "Figure",
    ],
)
def test_rejects_non_captions(line: str) -> None:
    assert parse_caption_start(line) is None


def test_label_is_normalized_for_display() -> None:
    """'Fig. 2' and 'FIGURE 2' must both display as 'Figure 2'."""
    assert parse_caption_start("Fig. 2 Results.").label == "Figure 2"
    assert parse_caption_start("FIGURE 2: Results.").label == "Figure 2"
    assert parse_caption_start("Table 4: Ablations.").label == "Table 4"


def test_reports_delimiter_strength() -> None:
    """A colon after the number is strong evidence of a real caption.

    'Figure 1 shows that ...' is a sentence opener, not a caption. Both parse, so the
    delimiter signal is what lets figures.py prefer the real one when they collide.
    """
    assert parse_caption_start("Figure 1: Overview.").has_delimiter is True
    assert parse_caption_start("Figure 1 shows that accuracy improves.").has_delimiter is False


def test_asset_id_derives_from_kind_and_number() -> None:
    assert parse_caption_start("Figure 3a: Detail.").asset_id == "fig-3a"
    assert parse_caption_start("Table 4: Ablations.").asset_id == "tab-4"
    assert parse_caption_start("Algorithm 1 Loop").asset_id == "alg-1"
    assert parse_caption_start("Figure A.1: Appendix.").asset_id == "fig-A.1"


def test_subfigure_number_yields_parent_id() -> None:
    assert parse_caption_start("Figure 3a: Detail.").parent_id == "fig-3"
    assert parse_caption_start("Figure 3: Overview.").parent_id is None
    assert parse_caption_start("Figure S3: Appendix.").parent_id is None
