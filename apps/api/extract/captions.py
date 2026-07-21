"""Caption anchor parsing.

The caption-anchored heuristic is the primary figure backend (plan deviation 2), so this
is where figure detection starts: find the caption, then find the region attached to it.

Precision problem worth knowing about: "Figure 1: Overview" (a caption) and "Figure 1
shows that accuracy improves" (a sentence that happens to start a block) are both matched
by any anchored pattern. Rather than guess here, this module reports `has_delimiter` and
lets figures.py break the tie with geometry.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

_KIND_PREFIXES = {"figure": "fig", "table": "tab", "algorithm": "alg", "equation": "eq"}

# Singular forms only: "Figures 2 and 3" is a mention, never a caption. The plural is
# excluded structurally (the pattern requires a digit right after the word) rather than
# by a negative lookahead, so "Figures" simply fails to match.
_CAPTION_RE = re.compile(
    r"^\s*(?P<word>Fig(?:ure)?|Tab(?:le)?|Alg(?:orithm)?)\.?\s*"
    r"(?P<number>S\d+|A\.\d+|\d+[a-z]?)"
    r"(?P<rest>[^\w].*|$)",
    re.IGNORECASE | re.DOTALL,
)
_WORD_TO_KIND = {"fig": "figure", "tab": "table", "alg": "algorithm"}
_SUBFIGURE_RE = re.compile(r"^(\d+)([a-z])$")
_DELIMITERS = {":", ".", "-", "–", "—", ")"}


@dataclass(frozen=True)
class CaptionAnchor:
    """A parsed caption opener. Position is attached later, by figures.py."""

    kind: str
    number: str
    label: str
    has_delimiter: bool

    @property
    def asset_id(self) -> str:
        return f"{_KIND_PREFIXES[self.kind]}-{self.number}"

    @property
    def parent_id(self) -> str | None:
        """'3a' belongs to 'fig-3'. 'S3' and 'A.1' are whole assets, not subfigures."""
        match = _SUBFIGURE_RE.match(self.number)
        if match is None:
            return None
        return f"{_KIND_PREFIXES[self.kind]}-{match.group(1)}"


def parse_caption_start(line: str) -> CaptionAnchor | None:
    """Parse the opening of a text block as a caption, or return None."""
    match = _CAPTION_RE.match(line)
    if match is None:
        return None

    word = match.group("word").lower()
    kind = _WORD_TO_KIND[word[:3]]

    number = match.group("number")
    # Keep appendix prefixes upper ("S3", "A.1"); lowercase only a subfigure suffix so
    # "Figure 3A" and "Figure 3a" resolve to the same asset.
    number = number[0].upper() + number[1:].lower() if number[0].isalpha() else number.lower()

    rest = match.group("rest").lstrip()
    return CaptionAnchor(
        kind=kind,
        number=number,
        label=f"{kind.capitalize()} {number}",
        has_delimiter=bool(rest) and rest[0] in _DELIMITERS,
    )
