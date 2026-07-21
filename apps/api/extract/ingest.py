"""Ingest: content hashing, the scanned-PDF gate, title and page geometry.

Spec section 6 stage 1. The content hash is load-bearing well beyond this module: spec D1
keys the entire cache on it, which is what makes the hundredth reader of a popular paper
free. It must stay a pure function of the file bytes.
"""

from __future__ import annotations

import hashlib

import fitz

from .textnorm import normalize

# Below this many characters across the sampled pages, treat the PDF as scanned. A real
# 15-page paper has tens of thousands; a cover page alone clears 100.
_MIN_TEXT_CHARS = 100
_SAMPLE_PAGES = 10
# Titles sit at the top of page one; anything lower is a section heading.
_TITLE_SEARCH_FRACTION = 0.5
_GENERIC_TITLES = {"", "untitled", "untitled document", "microsoft word"}


def _is_horizontal(direction: tuple[float, float]) -> bool:
    """PyMuPDF reports a line's writing direction as a unit vector; (1, 0) is normal."""
    return abs(direction[0]) > 0.9 and abs(direction[1]) < 0.1


def compute_doc_id(data: bytes) -> str:
    """sha256:<hex> over the raw PDF bytes (spec D1)."""
    return f"sha256:{hashlib.sha256(data).hexdigest()}"


def has_text_layer(doc: fitz.Document) -> bool:
    """False for scanned PDFs. OCR is out of scope for v1, so callers must fail clearly."""
    chars = 0
    for page_index in range(min(doc.page_count, _SAMPLE_PAGES)):
        chars += len(doc[page_index].get_text("text").strip())
        if chars >= _MIN_TEXT_CHARS:
            return True
    return False


def extract_title(doc: fitz.Document) -> str:
    """PDF metadata when it is meaningful, else the largest text at the top of page one."""
    metadata_title = normalize((doc.metadata or {}).get("title") or "")
    if metadata_title.lower() not in _GENERIC_TITLES:
        return metadata_title

    if doc.page_count == 0:
        return ""

    page = doc[0]
    cutoff = page.rect.height * _TITLE_SEARCH_FRACTION
    best_size = 0.0
    best_text = ""
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            spans = [s for s in line.get("spans", []) if s["text"].strip()]
            if not spans or line["bbox"][1] > cutoff:
                continue
            # Every arXiv PDF stamps "arXiv:xxxx [cs.CL] date" sideways down the left
            # margin at 20pt, which outranks a 17pt title. Titles are set horizontally.
            if not _is_horizontal(line.get("dir", (1.0, 0.0))):
                continue
            size = max(s["size"] for s in spans)
            if size > best_size:
                best_size = size
                best_text = normalize("".join(s["text"] for s in spans))
    return best_text


def page_geometry(doc: fitz.Document) -> list[dict]:
    """Per-page size in points, for the client's coordinate math."""
    return [
        {
            "index": index,
            "width_pt": float(doc[index].rect.width),
            "height_pt": float(doc[index].rect.height),
        }
        for index in range(doc.page_count)
    ]
