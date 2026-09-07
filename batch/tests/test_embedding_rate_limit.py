import httpx

from embedding.worker import (
    ClovaEmbeddingError,
    parse_rate_limit_seconds,
    rate_limit_delay_from_headers,
)


def test_parse_rate_limit_seconds():
    assert parse_rate_limit_seconds("23s") == 23
    assert parse_rate_limit_seconds("1500ms") == 1.5
    assert parse_rate_limit_seconds("2m") == 120
    assert parse_rate_limit_seconds("7") == 7
    assert parse_rate_limit_seconds(None) is None


def test_rate_limit_delay_uses_longest_reset_window():
    headers = httpx.Headers(
        {
            "retry-after": "5",
            "x-ratelimit-reset-requests": "23s",
            "x-ratelimit-reset-tokens": "31s",
        }
    )
    assert rate_limit_delay_from_headers(headers) == 31


def test_clova_api_429_code_is_retriable_even_with_http_200():
    error = ClovaEmbeddingError(
        "rate exceeded",
        http_status=200,
        api_code="42900",
        retry_after_seconds=23,
    )
    assert error.retriable is True
    assert error.retry_after_seconds == 23
