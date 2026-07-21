"""CLI entry point: the M0 deliverable.

    uv run python -m extract paper.pdf > manifest.json

stdout carries the manifest and nothing else so the redirect above stays clean; progress
and warnings go to stderr.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .ingest import compute_doc_id
from .manifest import ScannedPdfError, build_manifest

DEFAULT_DATA_DIR = Path("data")


def _parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="python -m extract",
        description="Extract a PDF into a Marginalia manifest.",
    )
    parser.add_argument("pdf", type=Path, help="path to the PDF")
    parser.add_argument(
        "--data-dir",
        type=Path,
        default=DEFAULT_DATA_DIR,
        help="content-hash keyed blob store (default: ./data)",
    )
    parser.add_argument("--arxiv-id", default=None, help="record an arXiv source id")
    parser.add_argument(
        "--force", action="store_true", help="re-extract even if a manifest is cached"
    )
    parser.add_argument(
        "--verbose", action="store_true", help="print extraction warnings to stderr"
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    # A Windows console defaults to cp1252, which cannot encode the author lists of most
    # papers ("Łukasz Kaiser" alone breaks it). The manifest is UTF-8 by definition.
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is not None:
            reconfigure(encoding="utf-8")

    args = _parse_args(argv)

    if not args.pdf.is_file():
        print(f"error: {args.pdf} not found", file=sys.stderr)
        return 2

    pdf_bytes = args.pdf.read_bytes()
    digest = compute_doc_id(pdf_bytes).removeprefix("sha256:")
    doc_dir = args.data_dir / digest
    manifest_path = doc_dir / "manifest.json"

    # Spec D1: extraction runs once per unique document, ever.
    if manifest_path.is_file() and not args.force:
        print(manifest_path.read_text(encoding="utf-8").strip())
        return 0

    try:
        manifest = build_manifest(pdf_bytes, blob_dir=doc_dir, arxiv_id=args.arxiv_id)
    except ScannedPdfError as error:
        print(f"error: {error}", file=sys.stderr)
        return 2

    doc_dir.mkdir(parents=True, exist_ok=True)
    (doc_dir / "paper.pdf").write_bytes(pdf_bytes)
    serialized = json.dumps(manifest, indent=2, ensure_ascii=False)
    manifest_path.write_text(serialized, encoding="utf-8")

    if args.verbose:
        for warning in manifest["extraction"]["warnings"]:
            print(f"warning: {warning}", file=sys.stderr)
        print(
            f"extracted {len(manifest['assets'])} assets from {manifest['page_count']} pages",
            file=sys.stderr,
        )

    print(serialized)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
