from scheduler.kmdb_client import (
    build_kmdb_search_queries,
    fetch_best_kmdb_match,
    needs_kmdb_enrichment,
)


def test_director_query_recovers_hope_when_generic_results_do_not_match():
    attempted = []

    def fake_fetcher(query: str, detail: str = "Y") -> list[dict]:
        attempted.append(query)
        if query == "호프 나홍진":
            return [
                {
                    "DOCID": "K40120",
                    "title": "<!HS>호프<!HE>",
                    "titleEng": "Hope (Hopeu)",
                    "prodYear": "2026",
                }
            ]
        return [{"DOCID": "F00001", "title": "호프", "prodYear": "2019"}]

    match, calls = fetch_best_kmdb_match(
        "호프",
        "HOPE",
        "2026",
        ["나홍진"],
        fetcher=fake_fetcher,
        request_delay=0,
    )

    assert match is not None
    assert match["DOCID"] == "K40120"
    assert calls == 2
    assert attempted == ["호프", "호프 나홍진"]


def test_search_queries_include_director_and_english_fallbacks():
    assert build_kmdb_search_queries("호프", "HOPE", ["나홍진"]) == [
        "호프",
        "호프 나홍진",
        "HOPE",
        "HOPE 나홍진",
    ]


def test_unmatched_existing_movie_is_retried():
    merged = {
        "unmatched": {"kmdb_matched": False},
        "matched": {"kmdb_matched": True},
    }

    assert needs_kmdb_enrichment("new", merged) is True
    assert needs_kmdb_enrichment("unmatched", merged) is True
    assert needs_kmdb_enrichment("matched", merged) is False
