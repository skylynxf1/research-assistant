"""HTTP API (plan phase 3).

Single process, inline extraction, filesystem storage. No worker queue, no database -
at one-user scale a database stores files worse than the filesystem does, and spec D3
already says the manifest is a static artifact.
"""

from __future__ import annotations

import json
from pathlib import Path

import fitz
import pytest
from fastapi.testclient import TestClient

from main import create_app


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """A fresh app with an isolated blob store per test."""
    app = create_app(data_dir=tmp_path / "data")
    with TestClient(app) as test_client:
        yield test_client


def _upload(client: TestClient, pdf: Path):
    return client.post(
        "/api/papers",
        files={"file": (pdf.name, pdf.read_bytes(), "application/pdf")},
    )


def test_upload_returns_a_manifest(client: TestClient, paper_pdf: Path) -> None:
    response = _upload(client, paper_pdf)
    assert response.status_code == 200

    body = response.json()
    assert body["doc_id"].startswith("sha256:")
    assert body["page_count"] == 2
    assert {a["asset_id"] for a in body["assets"]} == {"fig-1", "tab-1"}


def test_manifest_can_be_fetched_by_doc_id(client: TestClient, paper_pdf: Path) -> None:
    doc_id = _upload(client, paper_pdf).json()["doc_id"]
    digest = doc_id.removeprefix("sha256:")

    response = client.get(f"/api/papers/{digest}")
    assert response.status_code == 200
    assert response.json()["doc_id"] == doc_id


def test_unknown_document_is_404(client: TestClient) -> None:
    response = client.get("/api/papers/" + "0" * 64)
    assert response.status_code == 404


def test_second_upload_is_served_from_cache(client: TestClient, paper_pdf: Path) -> None:
    """Spec D1: extraction runs once per unique PDF, ever."""
    first = _upload(client, paper_pdf).json()

    digest = first["doc_id"].removeprefix("sha256:")
    manifest_path = Path(client.app.state.data_dir) / digest / "manifest.json"
    cached = json.loads(manifest_path.read_text(encoding="utf-8"))
    cached["title"] = "served from cache"
    manifest_path.write_text(json.dumps(cached), encoding="utf-8")

    assert _upload(client, paper_pdf).json()["title"] == "served from cache"


def test_crops_are_served_from_the_blob_store(client: TestClient, paper_pdf: Path) -> None:
    manifest = _upload(client, paper_pdf).json()
    image_url = manifest["assets"][0]["image_url"]

    response = client.get(image_url)
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert response.content[:4] == b"\x89PNG"


def test_original_pdf_is_served(client: TestClient, paper_pdf: Path) -> None:
    digest = _upload(client, paper_pdf).json()["doc_id"].removeprefix("sha256:")
    response = client.get(f"/blob/{digest}/paper.pdf")
    assert response.status_code == 200
    assert response.content[:5] == b"%PDF-"


@pytest.mark.parametrize(
    "path",
    [
        "/blob/../../../etc/passwd",
        "/blob/%2e%2e%2f%2e%2e%2fsecret.txt",
        "/blob/not-a-digest/paper.pdf",
    ],
)
def test_blob_store_rejects_path_traversal(client: TestClient, path: str) -> None:
    """The digest is the only thing that may select a directory."""
    assert client.get(path).status_code in (400, 404)


def test_scanned_pdf_is_rejected_with_a_clear_message(
    client: TestClient, tmp_path: Path
) -> None:
    doc = fitz.open()
    doc.new_page(width=612, height=792).draw_rect(
        fitz.Rect(50, 50, 500, 700), fill=(0.5, 0.5, 0.5)
    )
    path = tmp_path / "scanned.pdf"
    doc.save(str(path))
    doc.close()

    response = _upload(client, path)
    assert response.status_code == 422
    assert "text layer" in response.json()["detail"]


def test_non_pdf_upload_is_rejected(client: TestClient) -> None:
    response = client.post(
        "/api/papers", files={"file": ("notes.txt", b"just text", "text/plain")}
    )
    assert response.status_code == 400


def test_upload_requires_a_file_or_an_arxiv_id(client: TestClient) -> None:
    assert client.post("/api/papers").status_code == 422
