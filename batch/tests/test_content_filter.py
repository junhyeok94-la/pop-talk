from scheduler.config import is_excluded_movie


def test_adult_content_company_and_director_filters():
    assert is_excluded_movie(
        {"companys": [{"companyNm": "엔트리커뮤니케이션즈"}]}
    )
    assert is_excluded_movie(
        {
            "companys": [
                {"companyNm": "라임필름"},
                {"companyNm": "케이엘 픽쳐스"},
            ]
        }
    )
    assert not is_excluded_movie({"companys": [{"companyNm": "라임필름"}]})
    assert is_excluded_movie({"directors": [{"peopleNm": "김종석"}]})
    assert is_excluded_movie({"directors": [{"peopleNm": "천성준"}]})
