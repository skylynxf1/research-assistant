from __future__ import annotations

import json
from pathlib import Path

import httpx

from blob_store import SupabaseBlobStore


def _store(handler) -> SupabaseBlobStore:
    return SupabaseBlobStore(
        url="https://project.supabase.co",
        secret_key="sb_secret_test-only",
        bucket="marginalia-papers",
        client=httpx.Client(transport=httpx.MockTransport(handler)),
    )


def test_supabase_manifest_download_uses_private_storage_and_apikey_only() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "GET"
        assert request.url.path.endswith(
            "/storage/v1/object/authenticated/marginalia-papers/"
            + "a" * 64
            + "/manifest.json"
        )
        assert request.headers["apikey"] == "sb_secret_test-only"
        assert "authorization" not in request.headers
        return httpx.Response(200, json={"doc_id": "sha256:" + "a" * 64})

    manifest = _store(handler).load_manifest("a" * 64)
    assert manifest == {"doc_id": "sha256:" + "a" * 64}


def test_supabase_missing_manifest_is_a_cache_miss() -> None:
    store = _store(lambda _request: httpx.Response(404, json={"message": "not found"}))
    assert store.load_manifest("b" * 64) is None


def test_supabase_uploads_manifest_last(tmp_path: Path) -> None:
    source = tmp_path / "document"
    (source / "crops").mkdir(parents=True)
    (source / "paper.pdf").write_bytes(b"%PDF-test")
    (source / "crops" / "fig-1.png").write_bytes(b"\x89PNG")
    (source / "manifest.json").write_text(
        json.dumps({"doc_id": "sha256:" + "c" * 64}), encoding="utf-8"
    )

    uploaded: list[tuple[str, str]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        uploaded.append((request.url.path, request.headers["content-type"]))
        assert request.method == "POST"
        assert request.headers["x-upsert"] == "true"
        assert request.headers["apikey"] == "sb_secret_test-only"
        return httpx.Response(200, json={"Key": request.url.path})

    _store(handler).save_document("c" * 64, source)

    assert uploaded[-1][0].endswith("/manifest.json")
    assert [content_type for _, content_type in uploaded] == [
        "application/pdf",
        "image/png",
        "application/json",
    ]
