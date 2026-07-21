"""Manifest assembly: the one artifact the pipeline produces.

Spec D3 - the client is a dumb renderer over this document and makes no server round
trips while reading. Everything the reader needs must therefore be in here, and anything
uncertain must be absent rather than wrong (spec section 11).
"""

from __future__ import annotations

from pathlib import Path
from typing import Iterable

import fitz

from . import EXTRACTION_VERSION
from .crops import render_asset_crop, render_thumbnail
from .figures import DetectedAsset, detect_assets
from .ingest import compute_doc_id, extract_title, has_text_layer, page_geometry
from .references import Reference, extract_references
from .sections import detect_sections

FIGURE_BACKEND = "caption-heuristic"


class ScannedPdfError(RuntimeError):
    """Raised when a PDF has no usable text layer.

    Without text there are no mentions, so the product has nothing to offer. OCR is out
    of scope for v1; the caller shows this as a clear message (spec section 6 stage 1).
    """


def _asset_entry(asset: DetectedAsset, digest: str, image_width: int) -> dict:
    return {
        "asset_id": asset.asset_id,
        "kind": asset.kind,
        "label": asset.label,
        "number": asset.number,
        "page": asset.page,
        "bbox": list(asset.bbox),
        "caption": asset.caption,
        "caption_bbox": list(asset.caption_bbox),
        "image_url": f"/blob/{digest}/crops/{asset.asset_id}.png",
        "image_width": image_width,
        "parent_id": asset.parent_id,
    }


def build_manifest(
    pdf_bytes: bytes,
    *,
    blob_dir: Path,
    arxiv_id: str | None = None,
) -> dict:
    """Extract `pdf_bytes` into a manifest, writing crops under `blob_dir`.

    `blob_dir` is the per-document directory, i.e. data/<digest>/.
    """
    doc_id = compute_doc_id(pdf_bytes)
    digest = doc_id.removeprefix("sha256:")

    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        if not has_text_layer(doc):
            raise ScannedPdfError(
                "This PDF has no text layer, so it is probably a scan. "
                "Marginalia cannot find figure mentions without text; OCR is not supported."
            )

        assets, warnings = detect_assets(doc)
        sections = detect_sections(doc)
        references, reference_warnings = extract_references(doc)
        warnings = [*warnings, *reference_warnings]

        asset_entries = []
        for asset in assets:
            crop = render_asset_crop(
                doc[asset.page],
                asset.bbox,
                blob_dir / "crops" / f"{asset.asset_id}.png",
            )
            render_thumbnail(crop.path, blob_dir / "crops" / f"{asset.asset_id}.thumb.png")
            asset_entries.append(_asset_entry(asset, digest, crop.width))

        return {
            "doc_id": doc_id,
            "source": {
                "type": "arxiv" if arxiv_id else "upload",
                "arxiv_id": arxiv_id,
            },
            "title": extract_title(doc),
            "page_count": doc.page_count,
            "pages": page_geometry(doc),
            "assets": asset_entries,
            "references": [
                {
                    "ref_id": r.ref_id,
                    "marker": r.marker,
                    "raw": r.raw,
                    "title": r.title,
                    "authors": list(r.authors),
                    "year": r.year,
                    "arxiv_id": r.arxiv_id,
                    "openable": r.openable,
                }
                for r in references
            ],
            "sections": [
                {"title": s.title, "page": s.page, "level": s.level} for s in sections
            ],
            "extraction": {
                "version": EXTRACTION_VERSION,
                "figure_backend": FIGURE_BACKEND,
                "warnings": warnings,
            },
        }
    finally:
        doc.close()
