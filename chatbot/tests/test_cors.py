from fastapi.testclient import TestClient

from app.main import app


def test_any_origin_is_allowed_by_preflight() -> None:
    response = TestClient(app).options(
        "/api/chat",
        headers={
            "Origin": "https://poptalk.kr",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "*"
    assert "access-control-allow-credentials" not in response.headers


def test_arbitrary_origin_is_allowed_by_preflight() -> None:
    response = TestClient(app).options(
        "/api/chat",
        headers={
            "Origin": "https://malicious.example",
            "Access-Control-Request-Method": "POST",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "*"
