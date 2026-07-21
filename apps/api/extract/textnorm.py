"""Text-layer normalization for the Python side (captions, references).

Scope note: the client normalizes its own text for mention detection and does NOT share
a contract with this module (plan deviation 1). That is the point - two implementations
kept byte-identical across two languages is a permanent bug source. These two are allowed
to drift because nothing joins their outputs.
"""

from __future__ import annotations

import re
import unicodedata

# NFKC already folds the ligatures (U+FB01 -> "fi"). These are the ones it leaves alone.
_PUNCTUATION = {
    "–": "-",  # en dash
    "—": "-",  # em dash
    "‐": "-",  # hyphen
    "‑": "-",  # non-breaking hyphen
    "−": "-",  # minus sign
    "“": '"',
    "”": '"',
    "‘": "'",
    "’": "'",
    " ": " ",
}
_PUNCTUATION_RE = re.compile("|".join(map(re.escape, _PUNCTUATION)))

# A word split across a line break: rejoin only when the continuation is lowercase.
_SPLIT_WORD_RE = re.compile(r"(\w)-\s*\n\s*([a-z])")
# "Transformer-\nBase" is a compound, not a split word: drop the break, keep the hyphen.
_BROKEN_COMPOUND_RE = re.compile(r"(\w)-\s*\n\s*([A-Z0-9])")


def join_hyphenated(text: str) -> str:
    """Repair words broken across line breaks ("Fig-\\nure 3" -> "Figure 3")."""
    text = _SPLIT_WORD_RE.sub(r"\1\2", text)
    return _BROKEN_COMPOUND_RE.sub(r"\1-\2", text)


def normalize(text: str) -> str:
    """Fold ligatures and punctuation variants, then collapse whitespace.

    Idempotent, so it is safe to apply to already-normalized text.
    """
    text = unicodedata.normalize("NFKC", text)
    text = _PUNCTUATION_RE.sub(lambda m: _PUNCTUATION[m.group(0)], text)
    return re.sub(r"\s+", " ", text).strip()


def clean_block_text(text: str) -> str:
    """The full pipeline applied to a PyMuPDF text block: rejoin, then normalize."""
    return normalize(join_hyphenated(text))
