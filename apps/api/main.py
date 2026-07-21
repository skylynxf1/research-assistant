"""Marginalia HTTP API.

Single process, inline extraction, filesystem storage - no worker queue, no database, no
object store. Spec section 9 calls for Postgres, Redis, arq and S3; all are cut. Spec D3
already says the manifest is a static artifact and the client is a dumb renderer over it,
so at this scale a database would store files worse than the filesystem does.

Layout of the blob store, keyed by content hash exactly as spec D1 requires:

    data/<digest>/paper.pdf
    data/<digest>/manifest.json
    data/<digest>/crops/*.png
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import httpx
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from extract.arxiv import fetch_pdf, normalize_arxiv_id
from extract.ingest import compute_doc_id
from extract.manifest import ScannedPdfError, build_manifest

DEFAULT_DATA_DIR = Path(__file__).resolve().parents[2] / "data"
_DIGEST_RE = re.compile(r"^[0-9a-f]{64}$")
# The reader is local-only, so the dev server is the only origin that matters.
_ALLOWED_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"]


def _require_digest(digest: str) -> str:
    """The digest is the only user-supplied component of a blob path.

    Constraining it to 64 hex characters is what makes the store traversal-proof: no
    separators, no dots, nothing that can escape the data directory.
    """
    if not _DIGEST_RE.match(digest):
        raise HTTPException(status_code=400, detail="malformed document id")
    return digest


def _load_manifest(data_dir: Path, digest: str) -> dict | None:
    path = data_dir / digest / "manifest.json"
    if not path.is_file():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def _extract_and_store(data_dir: Path, pdf_bytes: bytes, arxiv_id: str | None) -> dict:
    """Extract unless a manifest already exists (spec D1)."""
    digest = compute_doc_id(pdf_bytes).removeprefix("sha256:")
    doc_dir = data_dir / digest

    cached = _load_manifest(data_dir, digest)
    if cached is not None:
        return cached

    try:
        manifest = build_manifest(pdf_bytes, blob_dir=doc_dir, arxiv_id=arxiv_id)
    except ScannedPdfError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error

    doc_dir.mkdir(parents=True, exist_ok=True)
    (doc_dir / "paper.pdf").write_bytes(pdf_bytes)
    (doc_dir / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    return manifest


def create_app(*, data_dir: Path | None = None) -> FastAPI:
    app = FastAPI(title="Marginalia", version="0.1.0")
    app.state.data_dir = Path(data_dir or DEFAULT_DATA_DIR)
    app.state.data_dir.mkdir(parents=True, exist_ok=True)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=_ALLOWED_ORIGINS,
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
    )

    @app.post("/api/papers")
    async def create_paper(
        file: UploadFile | None = File(default=None),
        arxiv_id: str | None = Form(default=None),
    ) -> dict:
        """Ingest a PDF by upload or arXiv id and return its manifest.

        Extraction is inline. A cached paper returns immediately, which is the common
        case and the reason spec D1 exists.
        """
        if file is None and not arxiv_id:
            raise HTTPException(status_code=422, detail="provide a file or an arxiv_id")

        resolved_id: str | None = None
        if file is not None:
            pdf_bytes = await file.read()
        else:
            resolved_id = normalize_arxiv_id(arxiv_id or "")
            if resolved_id is None:
                raise HTTPException(status_code=400, detail="unrecognized arXiv id")
            try:
                pdf_bytes = fetch_pdf(resolved_id)
            except httpx.HTTPError as error:
                raise HTTPException(
                    status_code=502, detail=f"could not fetch {resolved_id} from arXiv"
                ) from error

        if not pdf_bytes.startswith(b"%PDF-"):
            raise HTTPException(status_code=400, detail="that file is not a PDF")

        return _extract_and_store(app.state.data_dir, pdf_bytes, resolved_id)

    @app.get("/api/papers/{digest}")
    async def get_paper(digest: str) -> dict:
        manifest = _load_manifest(app.state.data_dir, _require_digest(digest))
        if manifest is None:
            raise HTTPException(status_code=404, detail="no such document")
        return manifest

    @app.get("/blob/{digest}/paper.pdf")
    async def get_pdf(digest: str) -> FileResponse:
        path = app.state.data_dir / _require_digest(digest) / "paper.pdf"
        if not path.is_file():
            raise HTTPException(status_code=404, detail="no such document")
        return FileResponse(path, media_type="application/pdf")

    @app.get("/blob/{digest}/crops/{name}")
    async def get_crop(digest: str, name: str) -> FileResponse:
        # Crop names come from the manifest, but validate anyway: this is a filesystem
        # path being built from a URL.
        if not re.match(r"^[A-Za-z0-9._-]+\.png$", name) or ".." in name:
            raise HTTPException(status_code=400, detail="malformed crop name")
        path = app.state.data_dir / _require_digest(digest) / "crops" / name
        if not path.is_file():
            raise HTTPException(status_code=404, detail="no such crop")
        return FileResponse(path, media_type="image/png")

    @app.get("/api/health")
    async def health() -> dict:
        return {"status": "ok"}

    return app


app = create_app()
