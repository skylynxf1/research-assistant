"""Reference extraction (spec section 7a, plan phase 2).

We build this rather than calling a paper API, which is what makes it work on PDFs that
no catalog has indexed. Steps 1-2 (locate the section, split it into entries) are
geometric; step 4 (link markers to entries) is the client's job.
"""

from __future__ import annotations

from pathlib import Path

import fitz
import pytest

from extract.references import (
    extract_references,
    parse_entry,
    split_entries,
    split_entries_by_indent,
)

from .conftest import PAGE_H, PAGE_W


def test_parses_a_numbered_entry() -> None:
    entry = parse_entry(
        "[12] Ashish Vaswani, Noam Shazeer, and Niki Parmar. Attention is all you "
        "need. In Advances in Neural Information Processing Systems, 2017.",
        marker="12",
    )
    assert entry.marker == "12"
    assert entry.ref_id == "ref-12"
    assert entry.year == 2017
    assert entry.title == "Attention is all you need"
    assert "Ashish Vaswani" in entry.authors


def test_extracts_an_embedded_arxiv_id() -> None:
    entry = parse_entry(
        "[3] Jimmy Lei Ba and Geoffrey E Hinton. Layer normalization. "
        "arXiv preprint arXiv:1607.06450, 2016.",
        marker="3",
    )
    assert entry.arxiv_id == "1607.06450"
    assert entry.openable is True


def test_entry_without_a_preprint_is_not_openable() -> None:
    """Spec section 7c: with no resolver, a reference is plain text and no open button."""
    entry = parse_entry(
        "[4] Yoshua Bengio and Yann LeCun. Scaling learning algorithms towards AI. "
        "Large-Scale Kernel Machines, 2007.",
        marker="4",
    )
    assert entry.arxiv_id is None
    assert entry.openable is False


def test_parses_an_author_year_entry() -> None:
    entry = parse_entry(
        "Vaswani, A., & Shazeer, N. (2017). Attention is all you need. NeurIPS.",
        marker="Vaswani et al., 2017",
    )
    assert entry.year == 2017
    assert entry.ref_id == "ref-vaswani-et-al-2017"


def test_year_prefers_a_plausible_publication_year() -> None:
    """Page ranges and volume numbers must not be mistaken for years."""
    entry = parse_entry(
        "[9] K. He and X. Zhang. Deep residual learning. CVPR, pages 770-778, 2016.",
        marker="9",
    )
    assert entry.year == 2016


def test_splits_bracketed_entries() -> None:
    text = (
        "[1] First author. A first paper. 2015. "
        "[2] Second author. A second paper. 2016. "
        "[3] Third author. A third paper. 2017."
    )
    entries = split_entries(text)
    assert [marker for marker, _ in entries] == ["1", "2", "3"]
    assert entries[1][1].startswith("[2] Second author")


def test_split_ignores_bracketed_numbers_inside_an_entry() -> None:
    """A citation like "see [4]" mid-entry must not start a new reference."""
    text = "[1] An author. A paper that cites [4] in its title area. 2015. [2] Another. 2016."
    entries = split_entries(text)
    assert [marker for marker, _ in entries] == ["1", "2"]


def test_splits_author_year_entries_by_hanging_indent() -> None:
    """ACL style has no [n] markers; entries are found geometrically.

    BERT's bibliography is set this way and produced zero references until this existed.
    An entry's first line is flush left and its continuations are indented.
    """
    lines = [
        (90.0, "Jacob Devlin, Ming-Wei Chang, Kenton Lee, and Kristina"),
        (108.0, "Toutanova. 2018. BERT: Pre-training of deep bidirectional"),
        (108.0, "transformers for language understanding. In NAACL."),
        (90.0, "Yoshua Bengio, Rejean Ducharme, and Pascal Vincent. 2003."),
        (108.0, "A neural probabilistic language model. JMLR, 3:1137-1155."),
    ]
    entries = split_entries_by_indent(lines)

    assert len(entries) == 2
    assert entries[0][1].startswith("Jacob Devlin")
    assert "NAACL" in entries[0][1]
    assert entries[1][1].startswith("Yoshua Bengio")


def test_author_year_marker_is_derived_from_the_entry() -> None:
    """The client links inline "(Devlin et al., 2018)" to this marker."""
    lines = [
        (90.0, "Jacob Devlin, Ming-Wei Chang, and Kenton Lee. 2018. BERT:"),
        (108.0, "Pre-training of deep bidirectional transformers."),
    ]
    assert split_entries_by_indent(lines)[0][0] == "Devlin et al., 2018"


def test_single_author_marker_omits_et_al() -> None:
    lines = [
        (90.0, "Yoshua Bengio. 2003. A neural probabilistic language model."),
        (108.0, "Journal of Machine Learning Research."),
    ]
    assert split_entries_by_indent(lines)[0][0] == "Bengio, 2003"


def test_hanging_indent_is_measured_per_column() -> None:
    """Two-column bibliographies have two left margins, not one.

    Measuring one global margin makes every right-column line look like a continuation,
    so the whole right column is swallowed into the last left-column entry. BERT lost
    roughly half its references this way.
    """
    lines = [
        (72.0, "Alan Akbik and Duncan Blythe. 2018. Contextual string"),
        (82.9, "embeddings for sequence labeling. In COLING."),
        (72.0, "Rami Al-Rfou and Dokook Choe. 2018. Character-level"),
        (82.9, "language modeling with deeper self-attention."),
        (307.0, "Mandar Joshi and Eunsol Choi. 2017. Triviaqa: A large"),
        (317.9, "scale distantly supervised challenge dataset."),
        (307.0, "Ryan Kiros and Yukun Zhu. 2015. Skip-thought vectors."),
        (317.9, "In Advances in neural information processing systems."),
    ]
    entries = split_entries_by_indent(lines)
    assert [marker for marker, _ in entries] == [
        "Akbik et al., 2018",
        "Al-Rfou et al., 2018",
        "Joshi et al., 2017",
        "Kiros et al., 2015",
    ]


def test_author_year_title_skips_the_year_segment() -> None:
    """In ACL style the year sits between the authors and the title."""
    entry = parse_entry(
        "Alan Akbik, Duncan Blythe, and Roland Vollgraf. 2018. Contextual string "
        "embeddings for sequence labeling. In COLING.",
        marker="Akbik et al., 2018",
    )
    assert entry.title == "Contextual string embeddings for sequence labeling"


def test_flush_left_bibliography_is_not_split_line_by_line() -> None:
    """With no indent there is no signal, and one entry per line would be garbage.

    Precision-first: return nothing and let citations render as plain text.
    """
    lines = [(90.0, f"Some Author. 200{i}. A paper title here.") for i in range(4)]
    assert split_entries_by_indent(lines) == []


@pytest.fixture(scope="module")
def referenced_pdf(tmp_path_factory: pytest.TempPathFactory) -> Path:
    doc = fitz.open()
    page = doc.new_page(width=PAGE_W, height=PAGE_H)
    page.insert_text((90.0, 100.0), "5 Conclusion", fontsize=12)
    page.insert_text((90.0, 130.0), "We presented a model that dispenses with recurrence.", fontsize=10)
    page.insert_text((90.0, 200.0), "References", fontsize=12)
    page.insert_text(
        (90.0, 230.0),
        "[1] Jimmy Lei Ba and Geoffrey E Hinton. Layer normalization. arXiv:1607.06450, 2016.",
        fontsize=9,
    )
    page.insert_text(
        (90.0, 250.0),
        "[2] Yoshua Bengio and Yann LeCun. Scaling learning algorithms. NeurIPS, 2007.",
        fontsize=9,
    )
    page.insert_text((90.0, 320.0), "A Appendix", fontsize=12)
    page.insert_text(
        (90.0, 350.0), "[99] This entry lives after the appendix heading.", fontsize=9
    )
    path = tmp_path_factory.mktemp("pdfs") / "referenced.pdf"
    doc.save(str(path))
    doc.close()
    return path


def test_extracts_references_from_a_document(referenced_pdf: Path) -> None:
    doc = fitz.open(str(referenced_pdf))
    references, _ = extract_references(doc)
    doc.close()

    assert [r.marker for r in references] == ["1", "2"]
    assert references[0].arxiv_id == "1607.06450"


def test_stops_at_an_appendix_heading(referenced_pdf: Path) -> None:
    """Spec section 7a step 1: watch for appendices after the references."""
    doc = fitz.open(str(referenced_pdf))
    references, _ = extract_references(doc)
    doc.close()
    assert all(r.marker != "99" for r in references)


def test_document_without_references_yields_none(paper_pdf: Path) -> None:
    doc = fitz.open(str(paper_pdf))
    references, warnings = extract_references(doc)
    doc.close()
    assert references == []
    assert any("references" in w.lower() for w in warnings)
