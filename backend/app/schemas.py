from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator


class LoginRequest(BaseModel):
    """로그인에 사용하는 회원 인증 정보입니다."""

    email: EmailStr = Field(description="가입한 이메일 주소")
    password: str = Field(min_length=8, description="비밀번호(8자 이상)")


class RegisterRequest(LoginRequest):
    """일반 회원가입 정보입니다. 역할(role)은 서버에서 USER로 고정합니다."""

    nickname: str = Field(min_length=2, max_length=50, description="서비스에 표시할 닉네임(2~50자)")
    movie_category_ids: list[int] = Field(
        min_length=1,
        max_length=20,
        description="회원가입 온보딩에서 복수 선택한 활성 movie_categories ID 목록",
    )

    @field_validator("movie_category_ids")
    @classmethod
    def normalize_movie_category_ids(cls, values: list[int]) -> list[int]:
        normalized: list[int] = []
        for value in values:
            if value <= 0:
                raise ValueError("movie_category_ids must contain positive integers.")
            if value not in normalized:
                normalized.append(value)
        return normalized


class OnboardingUpdate(BaseModel):
    """회원이 온보딩에서 선택한 영화 카테고리입니다."""

    movie_category_ids: list[int] = Field(
        min_length=1,
        max_length=20,
        description="온보딩에서 복수 선택한 활성 movie_categories ID 목록",
    )

    @field_validator("movie_category_ids")
    @classmethod
    def normalize_movie_category_ids(cls, values: list[int]) -> list[int]:
        normalized: list[int] = []
        for value in values:
            if value <= 0:
                raise ValueError("movie_category_ids must contain positive integers.")
            if value not in normalized:
                normalized.append(value)
        return normalized


class MovieEditorialUpdate(BaseModel):
    """운영자가 보정하는 영화 줄거리와 자체 카테고리입니다."""

    plot_override: str | None = Field(default=None, max_length=10_000, description="수집 원본 plot 대신 서비스에 표시할 줄거리. null이면 보정값을 제거합니다.")
    category_ids: list[int] | None = Field(default=None, max_length=30, description="영화에 연결할 활성 카테고리 ID 목록. 빈 배열이면 전체 해제합니다.")

    @field_validator("plot_override")
    @classmethod
    def non_blank_plot(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError("plot_override must not be blank; use null to clear it.")
        return value.strip() if value else value

    @model_validator(mode="after")
    def has_change(self):
        if not self.model_fields_set:
            raise ValueError("At least one editable field is required.")
        return self


class MovieApprovalUpdate(BaseModel):
    """영화 검수 결과입니다."""

    status: Literal["PENDING", "APPROVED", "REJECTED"] = Field(description="검수 상태")
    reason: str | None = Field(default=None, max_length=500, description="반려(REJECTED) 사유. 반려 시 필수입니다.")

    @model_validator(mode="after")
    def rejection_has_reason(self):
        if self.status == "REJECTED" and not (self.reason or "").strip():
            raise ValueError("reason is required when status is REJECTED.")
        return self


class MovieServiceStatusUpdate(BaseModel):
    """영화의 서비스 노출 상태입니다."""

    status: Literal["DRAFT", "PUBLISHED", "HIDDEN"] = Field(description="DRAFT(초안), PUBLISHED(공개), HIDDEN(비공개)")


class MovieRemovalRequest(BaseModel):
    """영화 단건 논리 삭제 사유입니다."""

    reason: str = Field(min_length=1, max_length=500, description="삭제 사유. 원본 데이터는 보존됩니다.")


class MovieCategoryCreate(BaseModel):
    """Pop Talk 서비스에서 직접 운영할 영화 분류입니다."""

    code: str = Field(min_length=2, max_length=50, pattern=r"^[A-Z0-9_]+$", description="고유 코드(대문자 영문·숫자·밑줄만 허용)")
    name: str = Field(min_length=1, max_length=100, description="사용자에게 표시할 카테고리명")
    type: Literal["GENRE", "MOOD", "THEME", "RATING"] = Field(default="GENRE", description="카테고리 유형")
    description: str | None = Field(default=None, max_length=500, description="카테고리 설명")
    sort_order: int = Field(default=0, ge=0, le=10_000, description="목록 표시 순서(작을수록 먼저 표시)")


class MovieCategoryUpdate(BaseModel):
    """영화 운영 카테고리의 변경할 항목만 전달합니다."""

    name: str | None = Field(default=None, min_length=1, max_length=100, description="표시 이름")
    description: str | None = Field(default=None, max_length=500, description="카테고리 설명")
    sort_order: int | None = Field(default=None, ge=0, le=10_000, description="목록 표시 순서")
    is_active: bool | None = Field(default=None, description="활성 여부. 비활성 카테고리는 영화에 새로 연결할 수 없습니다.")

    @model_validator(mode="after")
    def has_change(self):
        if not self.model_fields_set:
            raise ValueError("At least one editable field is required.")
        return self


class ReviewCreate(BaseModel):
    """회원이 작성할 영화 리뷰입니다."""

    movie_id: int = Field(gt=0, description="리뷰를 작성할 영화 ID")
    rating: Decimal = Field(ge=Decimal("0.5"), le=Decimal("5.0"), description="평점(0.5~5.0, 0.5점 단위)")
    content: str = Field(min_length=1, max_length=3_000, description="리뷰 본문(1~3,000자)")
    contains_spoiler: bool = Field(default=False, description="스포일러 포함 여부")

    @field_validator("rating")
    @classmethod
    def half_star_increment(cls, value: Decimal) -> Decimal:
        if value * 2 != (value * 2).to_integral_value():
            raise ValueError("rating must use 0.5-point increments.")
        return value

    @field_validator("content")
    @classmethod
    def non_blank_content(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("content must not be blank.")
        return value


class ReviewUpdate(BaseModel):
    """회원 리뷰에서 변경할 항목만 전달합니다."""

    rating: Decimal | None = Field(default=None, ge=Decimal("0.5"), le=Decimal("5.0"), description="평점(0.5~5.0, 0.5점 단위)")
    content: str | None = Field(default=None, min_length=1, max_length=3_000, description="수정할 리뷰 본문")
    contains_spoiler: bool | None = Field(default=None, description="스포일러 포함 여부")

    @field_validator("rating")
    @classmethod
    def half_star_increment(cls, value: Decimal | None) -> Decimal | None:
        if value is not None and value * 2 != (value * 2).to_integral_value():
            raise ValueError("rating must use 0.5-point increments.")
        return value

    @field_validator("content")
    @classmethod
    def non_blank_content(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError("content must not be blank.")
        return value.strip() if value else value

    @model_validator(mode="after")
    def has_change(self):
        if not self.model_fields_set:
            raise ValueError("At least one editable field is required.")
        return self


class ReviewStatusUpdate(BaseModel):
    """관리자가 설정하는 리뷰 노출 상태입니다."""

    status: Literal["ACTIVE", "HIDDEN"] = Field(description="ACTIVE(노출), HIDDEN(숨김)")


MovieSort = Literal["release_date:desc", "release_date:asc", "created_at:desc", "popcorn_score:desc"]
MemberSort = Literal["joined_at:desc", "joined_at:asc", "last_login_at:desc", "nickname:asc"]
MemberStatus = Literal["ACTIVE", "SUSPENDED", "WITHDRAWN"]
