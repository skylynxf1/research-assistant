"""Marginalia HTTP API.

Extraction remains single-process and inline. Artifacts keep the content-addressed layout
required by spec D1, but the storage implementation is configurable: local development and
tests use the filesystem while Cloud Run uses a private Supabase Storage bucket.

Layout of either blob store:

    data/<digest>/paper.pdf
    data/<digest>/manifest.json
    data/<digest>/crops/*.png
"""

from __future__ import annotations

import json
import os
import re
import tempfile
from pathlib import Path

import httpx
from fastapi import FastAPI, File, Form, HTTPException, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from blob_store import BlobStore, BlobStoreError, FileBlobStore, SupabaseBlobStore
from extract.arxiv import fetch_pdf, normalize_arxiv_id
from extract.ingest import compute_doc_id
from extract.manifest import ScannedPdfError, build_manifest

_DEFAULT_MAX_PDF_BYTES = 30 * 1024 * 1024

DEFAULT_DATA_DIR = Path(__file__).resolve().parents[2] / "data"
_DIGEST_RE = re.compile(r"^[0-9a-f]{64}$")
# The reader is local-only, so loopback is the only origin that matters. The port is not
# pinned because Next picks the next free one when 3000 is taken.
_ALLOWED_ORIGIN_RE = r"http://(localhost|127\.0\.0\.1):\d+"


def _require_digest(digest: str) -> str:
    """The digest is the only user-supplied component of a blob path.

    Constraining it to 64 hex characters is what makes the store traversal-proof: no
    separators, no dots, nothing that can escape the data directory.
    """
    if not _DIGEST_RE.match(digest):
        raise HTTPException(status_code=400, detail="malformed document id")
    return digest


def _positive_int_env(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        value = int(raw)
    except ValueError as error:
        raise RuntimeError(f'{name} must be an integer') from error
    if value <= 0:
        raise RuntimeError(f'{name} must be positive')
    return value


def _store_from_environment(data_dir: Path | None) -> BlobStore:
    # An explicit data_dir is a test/local override and must ignore ambient credentials.
    if data_dir is not None:
        return FileBlobStore(data_dir)

    backend = os.getenv('MARGINALIA_STORAGE_BACKEND', 'filesystem').strip().lower()
    if backend == 'filesystem':
        configured_dir = Path(os.getenv('MARGINALIA_DATA_DIR', str(DEFAULT_DATA_DIR)))
        return FileBlobStore(configured_dir)
    if backend != 'supabase':
        raise RuntimeError('MARGINALIA_STORAGE_BACKEND must be filesystem or supabase')

    url = os.getenv('SUPABASE_URL', '').strip()
    secret_key = (
        os.getenv('SUPABASE_SECRET_KEY', '').strip()
        or os.getenv('SUPABASE_SERVICE_ROLE_KEY', '').strip()
    )
    if not url or not secret_key:
        raise RuntimeError(
            'Supabase storage requires SUPABASE_URL and SUPABASE_SECRET_KEY'
        )
    return SupabaseBlobStore(
        url=url,
        secret_key=secret_key,
        bucket=os.getenv('SUPABASE_STORAGE_BUCKET', 'marginalia-papers').strip(),
    )


def _cors_settings() -> tuple[list[str], str]:
    configured_origins = [
        value.strip()
        for value in os.getenv('CORS_ALLOW_ORIGINS', '').split(',')
        if value.strip()
    ]
    configured_regex = os.getenv('CORS_ALLOW_ORIGIN_REGEX', '').strip()
    regex = _ALLOWED_ORIGIN_RE
    if configured_regex:
        regex = f'(?:{_ALLOWED_ORIGIN_RE})|(?:{configured_regex})'
    return configured_origins, regex


def _extract_to_store(
    store: BlobStore,
    pdf_bytes: bytes,
    arxiv_id: str | None,
) -> dict:
    digest = compute_doc_id(pdf_bytes).removeprefix('sha256:')
    cached = store.load_manifest(digest)
    if cached is not None:
        return cached

    with tempfile.TemporaryDirectory(prefix=f'marginalia-{digest[:12]}-') as temp_dir:
        doc_dir = Path(temp_dir)
        try:
            manifest = build_manifest(pdf_bytes, blob_dir=doc_dir, arxiv_id=arxiv_id)
        except ScannedPdfError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error

        (doc_dir / 'paper.pdf').write_bytes(pdf_bytes)
        (doc_dir / 'manifest.json').write_text(
            json.dumps(manifest, indent=2, ensure_ascii=False), encoding='utf-8'
        )
        store.save_document(digest, doc_dir)
    return manifest


def create_app(
    *,
    data_dir: Path | None = None,
    blob_store: BlobStore | None = None,
) -> FastAPI:
    if data_dir is not None and blob_store is not None:
        raise ValueError('pass either data_dir or blob_store, not both')
    app = FastAPI(title="Marginalia", version="0.1.0")
    app.state.blob_store = blob_store or _store_from_environment(data_dir)
    app.state.data_dir = getattr(app.state.blob_store, 'data_dir', None)
    app.state.max_pdf_bytes = _positive_int_env(
        'MARGINALIA_MAX_PDF_BYTES', _DEFAULT_MAX_PDF_BYTES
    )

    allowed_origins, allowed_origin_regex = _cors_settings()

    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_origin_regex=allowed_origin_regex,
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
            pdf_bytes = await file.read(app.state.max_pdf_bytes + 1)
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

        if len(pdf_bytes) > app.state.max_pdf_bytes:
            raise HTTPException(
                status_code=413,
                detail=(
                    'PDF is larger than this deployment allows '
                    f'({app.state.max_pdf_bytes} bytes)'
                ),
            )

        try:
            return _extract_to_store(app.state.blob_store, pdf_bytes, resolved_id)
        except BlobStoreError as error:
            raise HTTPException(
                status_code=503,
                detail='paper storage is temporarily unavailable',
            ) from error

    @app.get("/api/papers/{digest}")
    async def get_paper(digest: str) -> dict:
        try:
            manifest = app.state.blob_store.load_manifest(_require_digest(digest))
        except BlobStoreError as error:
            raise HTTPException(
                status_code=503,
                detail="paper storage is temporarily unavailable",
            ) from error
        if manifest is None:
            raise HTTPException(status_code=404, detail="no such document")
        return manifest

    @app.get("/blob/{digest}/paper.pdf")
    async def get_pdf(digest: str) -> Response:
        try:
            content = app.state.blob_store.read_bytes(
                _require_digest(digest), "paper.pdf"
            )
        except BlobStoreError as error:
            raise HTTPException(
                status_code=503,
                detail="paper storage is temporarily unavailable",
            ) from error
        if content is None:
            raise HTTPException(status_code=404, detail="no such document")
        return Response(
            content,
            media_type="application/pdf",
            headers={"Cache-Control": "private, max-age=31536000, immutable"},
        )

    @app.get("/blob/{digest}/crops/{name}")
    async def get_crop(digest: str, name: str) -> Response:
        # Crop names come from the manifest, but validate before constructing either a
        # filesystem path or an object-store key.
        if not re.match(r"^[A-Za-z0-9._-]+\.png$", name) or ".." in name:
            raise HTTPException(status_code=400, detail="malformed crop name")
        try:
            content = app.state.blob_store.read_bytes(
                _require_digest(digest), f"crops/{name}"
            )
        except BlobStoreError as error:
            raise HTTPException(
                status_code=503,
                detail="paper storage is temporarily unavailable",
            ) from error
        if content is None:
            raise HTTPException(status_code=404, detail="no such crop")
        return Response(
            content,
            media_type="image/png",
            headers={"Cache-Control": "private, max-age=31536000, immutable"},
        )

    @app.get("/api/health")
    async def health() -> dict:
        return {
            "status": "ok",
            "storage": app.state.blob_store.backend_name,
        }

    return app


app = create_app()
