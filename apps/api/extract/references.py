"""Reference extraction (spec section 7a).

We build this rather than calling a paper API. That is the point: it works on PDFs no
catalog has indexed - internal reports, theses, old scans - which is a real advantage
over anyone resolving citations through a third party.

Spec section 7a's four steps, minus the last: locating the section and splitting it are
geometric, field parsing is regex, and linking inline markers to entries happens in the
client alongside mention detection.

Spec section 7a step 3 sanctions one LLM call here for messy entries. This build makes
none - see the non-goals in spec section 2. The heuristics below either parse an entry or
leave its fields null, and a null field renders as plain text rather than as a guess.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

import fitz

from .arxiv import find_arxiv_id
from .sections import looks_like_heading
from .textnorm import clean_block_text

_REFERENCES_HEADING_RE = re.compile(
    r"^\s*(?:\d+\.?\s+)?(references|bibliography|works cited)\s*$", re.IGNORECASE
)
# "[12] " at the start of an entry. Requires the following text to look like the start of
# an entry so that a mid-entry citation such as "see [4]" does not split the list.
_MARKER_RE = re.compile(r"\[(\d{1,3})\]\s+(?=[A-ZÀ-ɏ])")
_YEAR_RE = re.compile(r"\b(19[5-9]\d|20[0-4]\d)\b")
# What ends a bibliography. Keyword-based rather than "any lettered heading", because
# appendices are numbered "A Appendix" and so is the reference title "A Neural
# Probabilistic Language Model" - treating every lettered heading as a terminator
# truncates the list at the first such entry.
_END_OF_REFERENCES_RE = re.compile(
    r"^(?:[A-Z](?:\.\d+)?\.?\s+)?"
    r"(appendix|appendices|supplement(?:ary|al)?|acknowledge?ments?)\b",
    re.IGNORECASE,
)
_AUTHOR_YEAR_RE = re.compile(r"\((19[5-9]\d|20[0-4]\d)[a-z]?\)")
_YEAR_ONLY_RE = re.compile(r"\(?(19[5-9]\d|20[0-4]\d)[a-z]?\)?\.?")


@dataclass(frozen=True)
class Reference:
    ref_id: str
    marker: str
    raw: str
    title: str | None = None
    authors: list[str] = field(default_factory=list)
    year: int | None = None
    arxiv_id: str | None = None
    openable: bool = False


def _slugify(marker: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", marker.lower()).strip("-")
    return slug or "unknown"


def split_entries(text: str) -> list[tuple[str, str]]:
    """Split a references section into (marker, raw) pairs.

    Numbered styles split on their markers. Anything else is returned as a single entry
    for the caller to handle geometrically - guessing entry boundaries in an author-year
    list from text alone produces garbage entries, and a garbage entry is worse than none.
    """
    matches = list(_MARKER_RE.finditer(text))
    if not matches:
        return []

    entries: list[tuple[str, str]] = []
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        raw = text[match.start() : end].strip()
        entries.append((match.group(1), raw))
    return entries


# Two columns are separated by a gutter far wider than a hanging indent (~11pt).
_COLUMN_GAP = 40.0


def _column_lefts(xs: list[float]) -> list[float]:
    """The left margin of each text column, found by clustering line start positions."""
    lefts: list[float] = []
    for x in sorted(xs):
        if not lefts or x - lefts[-1] > _COLUMN_GAP:
            lefts.append(x)
    return lefts


def _nearest_column(x: float, columns: list[float]) -> float:
    candidates = [left for left in columns if left <= x + 1.0]
    return candidates[-1] if candidates else columns[0]


def _derive_marker(raw: str) -> str | None:
    """Build "Devlin et al., 2018" from an author-year entry.

    This is the string the client matches inline citations against, so it has to look
    the way the paper writes them.
    """
    year_match = _YEAR_RE.search(raw)
    if year_match is None:
        return None

    head = raw[: year_match.start()].strip(" .,")
    if not head:
        return None
    head = re.sub(r"\s*&\s*", ", ", head)
    head = re.sub(r"\s+and\s+", ", ", head)
    names = [n.strip(" .,") for n in head.split(",") if n.strip(" .,")]
    if not names:
        return None

    surname = names[0].split()[-1]
    if not surname[:1].isalpha():
        return None
    suffix = " et al." if len(names) > 1 else ""
    return f"{surname}{suffix}, {year_match.group(1)}"


def split_entries_by_indent(lines: list[tuple[float, str]]) -> list[tuple[str, str]]:
    """Split an author-year bibliography using its hanging indent.

    Spec section 7a step 2: an entry's first line starts at a lower x than its
    continuations, and x comes free from the text layer. Used for ACL-style
    bibliographies, which carry no [n] markers at all.

    Returns nothing when there is no indent to read, because one entry per line would be
    garbage and a garbage entry is worse than no entry.
    """
    if len(lines) < 2:
        return []

    tolerance = 2.0
    columns = _column_lefts([x for x, _ in lines])
    starts = [
        index
        for index, (x, _) in enumerate(lines)
        if x <= _nearest_column(x, columns) + tolerance
    ]
    # No hanging indent: every line looks like a fresh entry.
    if len(starts) == len(lines):
        return []

    entries: list[tuple[str, str]] = []
    for position, start in enumerate(starts):
        end = starts[position + 1] if position + 1 < len(starts) else len(lines)
        # Joined with the line break intact so hyphenated words rejoin correctly.
        raw = clean_block_text("\n".join(text for _x, text in lines[start:end]))
        marker = _derive_marker(raw)
        if marker is not None:
            entries.append((marker, raw))
    return entries


def _extract_title(raw: str) -> str | None:
    """The sentence after the author list.

    Reference styles vary enormously, so this is deliberately shallow: take the segment
    between the first and second sentence-ending period that looks like prose. When it
    does not look right, return None and let the client render the raw string.
    """
    body = _MARKER_RE.sub("", raw, count=1).strip()
    # Split on periods that end a sentence, not on initials ("A. Vaswani") or "et al.".
    parts = [p.strip() for p in re.split(r"(?<![A-Z])(?<!et al)\.\s+", body)]
    # ACL style puts the year between the authors and the title: "Authors. 2018. Title."
    candidates = [p for p in parts[1:] if not _YEAR_ONLY_RE.fullmatch(p)]
    if not candidates:
        return None
    candidate = candidates[0].rstrip(".")
    if len(candidate.split()) < 2 or len(candidate) > 250:
        return None
    return candidate


def _extract_authors(raw: str) -> list[str]:
    body = _MARKER_RE.sub("", raw, count=1).strip()
    parts = re.split(r"(?<![A-Z])(?<!et al)\.\s+", body)
    if not parts:
        return []
    head = parts[0]
    head = re.sub(r"\s*&\s*", ", ", head)
    head = re.sub(r"\s+and\s+", ", ", head)
    authors = [a.strip(" ,") for a in head.split(",")]
    return [a for a in authors if len(a.split()) >= 2][:12]


def _extract_year(raw: str) -> int | None:
    """Prefer a parenthesised year, then the last plausible year in the string.

    The last one is usually the publication year; earlier numbers tend to be page ranges
    or volume numbers that happen to fall in range.
    """
    parenthesised = _AUTHOR_YEAR_RE.search(raw)
    if parenthesised:
        return int(parenthesised.group(1))
    years = _YEAR_RE.findall(raw)
    return int(years[-1]) if years else None


def parse_entry(raw: str, marker: str) -> Reference:
    """Parse one reference string into structured fields."""
    raw = clean_block_text(raw)
    arxiv_id = find_arxiv_id(raw)
    return Reference(
        ref_id=f"ref-{_slugify(marker)}",
        marker=marker,
        raw=raw,
        title=_extract_title(raw),
        authors=_extract_authors(raw),
        year=_extract_year(raw),
        arxiv_id=arxiv_id,
        # Only an id we actually hold makes a reference openable. Spec section 11:
        # never render a dead affordance.
        openable=arxiv_id is not None,
    )


def _references_lines(doc: fitz.Document) -> list[tuple[float, str]] | None:
    """Lines from the References heading to the end, stopping at a later heading.

    Returns (x0, text) per line: the x is what makes hanging-indent splitting possible
    for bibliographies with no markers.

    Spec section 7a step 1 warns about appendices that follow the bibliography; without
    the stop condition, appendix prose is parsed as reference entries.
    """
    collecting = False
    collected: list[tuple[float, str]] = []

    for page_index in range(doc.page_count):
        for block in doc[page_index].get_text("dict")["blocks"]:
            for line in block.get("lines", []):
                # Kept raw: a word broken across two lines can only be rejoined once the
                # lines are concatenated with their break intact, so cleaning happens
                # when entries are assembled, not here.
                raw = "".join(span["text"] for span in line.get("spans", [])).strip()
                if not raw:
                    continue
                text = clean_block_text(raw)
                if not collecting:
                    if _REFERENCES_HEADING_RE.match(text):
                        collecting = True
                    continue
                # An appendix, or a numbered section heading, ends the list.
                is_terminator = _END_OF_REFERENCES_RE.match(text) is not None or (
                    looks_like_heading(text) and re.match(r"^\d", text) is not None
                )
                if is_terminator and not _MARKER_RE.match(text):
                    return collected or None
                collected.append((float(line["bbox"][0]), raw))

    if not collecting:
        return None
    return collected or None


def extract_references(doc: fitz.Document) -> tuple[list[Reference], list[str]]:
    """Extract every reference we can parse, plus warnings for what we could not."""
    warnings: list[str] = []
    lines = _references_lines(doc)
    if lines is None:
        warnings.append("no references section found; citations will render as plain text")
        return [], warnings

    # Numbered styles first: the marker is explicit and unambiguous. Author-year styles
    # (ACL, and most NLP papers) carry no markers, so fall back to the hanging indent.
    entries = split_entries("\n".join(text for _x, text in lines))
    if not entries:
        entries = split_entries_by_indent(lines)
    if not entries:
        warnings.append(
            "references section found but its entries could not be split apart; "
            "citations will render as plain text"
        )
        return [], warnings

    return [parse_entry(raw, marker) for marker, raw in entries], warnings
