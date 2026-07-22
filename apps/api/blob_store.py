"""Durable storage adapters for extracted paper artifacts.

The extraction pipeline still writes one content-addressed directory containing the
original PDF, a manifest, and figure crops.  This module moves that directory behind a
small interface so local development can keep using the filesystem while Cloud Run uses
private Supabase Storage.
"""

from __future__ import annotations

import json
import re
import shutil
from pathlib import Path
from typing import Protocol
from urllib.parse import quote

import httpx


class BlobStoreError(RuntimeError):
    """Raised when the configured durable store cannot complete an operation."""


class BlobStore(Protocol):
    backend_name: str

    def load_manifest(self, digest: str) -> dict | None: ...

    def read_bytes(self, digest: str, relative_path: str) -> bytes | None: ...

    def save_document(self, digest: str, source_dir: Path) -> None: ...


class FileBlobStore:
    """The original content-hash filesystem store used by local development and tests."""

    backend_name = "filesystem"

    def __init__(self, data_dir: Path) -> None:
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)

    def load_manifest(self, digest: str) -> dict | None:
        path = self.data_dir / digest / "manifest.json"
        if not path.is_file():
            return None
        try:
            value = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
            raise BlobStoreError("cached manifest could not be read") from error
        if not isinstance(value, dict):
            raise BlobStoreError("cached manifest is not a JSON object")
        return value

    def read_bytes(self, digest: str, relative_path: str) -> bytes | None:
        path = self.data_dir / digest / relative_path
        if not path.is_file():
            return None
        try:
            return path.read_bytes()
        except OSError as error:
            raise BlobStoreError("cached artifact could not be read") from error

    def save_document(self, digest: str, source_dir: Path) -> None:
        target_dir = self.data_dir / digest
        target_dir.mkdir(parents=True, exist_ok=True)

        # The manifest is the commit marker. Copy every artifact first and publish the
        # manifest atomically only after the document is complete.
        for source in sorted(source_dir.rglob("*")):
            if not source.is_file() or source.name == "manifest.json":
                continue
            destination = target_dir / source.relative_to(source_dir)
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, destination)

        manifest_source = source_dir / "manifest.json"
        manifest_temp = target_dir / "manifest.json.tmp"
        shutil.copyfile(manifest_source, manifest_temp)
        manifest_temp.replace(target_dir / "manifest.json")


_BUCKET_RE = re.compile(r"^[A-Za-z0-9._-]+$")


class SupabaseBlobStore:
    """Private Supabase Storage adapter used by the Cloud Run service.

    New ``sb_secret_`` keys are sent only through ``apikey``. They are opaque API keys,
    not JWTs, so treating one as an Authorization bearer token can fail with Invalid JWT.
    The Supabase gateway maps the secret key to the service role internally.
    """

    backend_name = "supabase"

    def __init__(
        self,
        *,
        url: str,
        secret_key: str,
        bucket: str,
        client: httpx.Client | None = None,
    ) -> None:
        normalized_url = url.strip().rstrip("/")
        if not normalized_url.startswith(("https://", "http://")):
            raise ValueError("SUPABASE_URL must be an http(s) URL")
        if not secret_key.strip():
            raise ValueError("SUPABASE_SECRET_KEY is required")
        if not _BUCKET_RE.fullmatch(bucket):
            raise ValueError("SUPABASE_STORAGE_BUCKET has invalid characters")

        self.url = normalized_url
        self.secret_key = secret_key.strip()
        self.bucket = bucket
        self.client = client or httpx.Client(timeout=httpx.Timeout(120.0, connect=10.0))

    @property
    def _headers(self) -> dict[str, str]:
        return {"apikey": self.secret_key}

    def _object_url(self, relative_path: str, *, authenticated: bool) -> str:
        bucket = quote(self.bucket, safe="")
        object_path = quote(relative_path, safe="/")
        access = "authenticated/" if authenticated else ""
        return f"{self.url}/storage/v1/object/{access}{bucket}/{object_path}"

    def _download(self, relative_path: str) -> bytes | None:
        try:
            response = self.client.get(
                self._object_url(relative_path, authenticated=True),
                headers=self._headers,
            )
        except httpx.HTTPError as error:
            raise BlobStoreError("Supabase Storage download failed") from error
        if response.status_code == 404:
            return None
        if not response.is_success:
            raise BlobStoreError(
                f"Supabase Storage download failed ({response.status_code})"
            )
        return response.content

    def _upload(self, relative_path: str, content: bytes, media_type: str) -> None:
        headers = {
            **self._headers,
            "content-type": media_type,
            "cache-control": "31536000",
            "x-upsert": "true",
        }
        try:
            response = self.client.post(
                self._object_url(relative_path, authenticated=False),
                headers=headers,
                content=content,
            )
        except httpx.HTTPError as error:
            raise BlobStoreError("Supabase Storage upload failed") from error
        if not response.is_success:
            raise BlobStoreError(
                f"Supabase Storage upload failed ({response.status_code})"
            )

    def load_manifest(self, digest: str) -> dict | None:
        content = self._download(f"{digest}/manifest.json")
        if content is None:
            return None
        try:
            value = json.loads(content)
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise BlobStoreError("cached Supabase manifest is invalid JSON") from error
        if not isinstance(value, dict):
            raise BlobStoreError("cached Supabase manifest is not a JSON object")
        return value

    def read_bytes(self, digest: str, relative_path: str) -> bytes | None:
        return self._download(f"{digest}/{relative_path}")

    def save_document(self, digest: str, source_dir: Path) -> None:
        paper = source_dir / "paper.pdf"
        self._upload(f"{digest}/paper.pdf", paper.read_bytes(), "application/pdf")

        crops_dir = source_dir / "crops"
        if crops_dir.is_dir():
            for crop in sorted(crops_dir.glob("*.png")):
                self._upload(
                    f"{digest}/crops/{crop.name}",
                    crop.read_bytes(),
                    "image/png",
                )

        # Publish the manifest last. Its presence is the durable cache-hit marker.
        manifest = source_dir / "manifest.json"
        self._upload(
            f"{digest}/manifest.json",
            manifest.read_bytes(),
            "application/json",
        )
