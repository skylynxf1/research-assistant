from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from main import create_app


def test_health_identifies_the_active_store(tmp_path: Path) -> None:
    with TestClient(create_app(data_dir=tmp_path / "data")) as client:
        assert client.get("/api/health").json() == {
            "status": "ok",
            "storage": "filesystem",
        }


def test_deployment_origin_can_be_allowed(
    tmp_path: Path, monkeypatch,
) -> None:
    monkeypatch.setenv("CORS_ALLOW_ORIGINS", "https://marginalia.vercel.app")
    with TestClient(create_app(data_dir=tmp_path / "data")) as client:
        response = client.options(
            "/api/papers/" + "a" * 64,
            headers={
                "Origin": "https://marginalia.vercel.app",
                "Access-Control-Request-Method": "GET",
            },
        )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == (
        "https://marginalia.vercel.app"
    )


def test_oversized_upload_is_rejected_before_extraction(
    tmp_path: Path, monkeypatch,
) -> None:
    monkeypatch.setenv("MARGINALIA_MAX_PDF_BYTES", "8")
    with TestClient(create_app(data_dir=tmp_path / "data")) as client:
        response = client.post(
            "/api/papers",
            files={"file": ("large.pdf", b"%PDF-more-than-eight", "application/pdf")},
        )
    assert response.status_code == 413
