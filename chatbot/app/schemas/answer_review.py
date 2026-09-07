from typing import Literal

from pydantic import BaseModel, Field


ReviewFailureType = Literal[
    "intent_mismatch",
    "unsupported_claim",
    "source_mismatch",
    "insufficient_evidence",
    "incomplete_answer",
    "spoiler_violation",
    "clarity_issue",
]

ReviewRetryStage = Literal["classify_intent", "analyze_query", "retrieve", "generate"]


class AnswerReviewScores(BaseModel):
    """고정 배점으로 답변 품질을 평가하는 세부 점수표(합계 100점)."""

    intent_alignment: int = Field(ge=0, le=25, description="사용자 질문과 답변의 의도 일치도")
    factual_grounding: int = Field(ge=0, le=30, description="제공된 검색 근거에만 기반했는지")
    completeness: int = Field(ge=0, le=20, description="질문의 필수 요구를 빠짐없이 답했는지")
    spoiler_safety: int = Field(ge=0, le=15, description="스포일러 제외 요청을 준수했는지")
    clarity: int = Field(ge=0, le=10, description="문장이 명료하고 읽기 쉬운지")

    @property
    def total_score(self) -> int:
        return sum(
            (
                self.intent_alignment,
                self.factual_grounding,
                self.completeness,
                self.spoiler_safety,
                self.clarity,
            )
        )


class AnswerReview(BaseModel):
    """검수 모델이 반환하는 구조화된 답변 품질 평가 결과."""

    scores: AnswerReviewScores
    failure_types: list[ReviewFailureType] = Field(default_factory=list)
    recommended_retry_stage: ReviewRetryStage = "generate"
    feedback: str = Field(min_length=1, max_length=1000)


ANSWER_REVIEW_JSON_SCHEMA = {
    "type": "object",
    "properties": {
        "scores": {
            "type": "object",
            "properties": {
                "intent_alignment": {"type": "integer", "minimum": 0, "maximum": 25},
                "factual_grounding": {"type": "integer", "minimum": 0, "maximum": 30},
                "completeness": {"type": "integer", "minimum": 0, "maximum": 20},
                "spoiler_safety": {"type": "integer", "minimum": 0, "maximum": 15},
                "clarity": {"type": "integer", "minimum": 0, "maximum": 10},
            },
            "required": [
                "intent_alignment",
                "factual_grounding",
                "completeness",
                "spoiler_safety",
                "clarity",
            ],
        },
        "failure_types": {
            "type": "array",
            "items": {
                "type": "string",
                "enum": [
                    "intent_mismatch",
                    "unsupported_claim",
                    "source_mismatch",
                    "insufficient_evidence",
                    "incomplete_answer",
                    "spoiler_violation",
                    "clarity_issue",
                ],
            },
        },
        "recommended_retry_stage": {
            "type": "string",
            "enum": ["classify_intent", "analyze_query", "retrieve", "generate"],
        },
        "feedback": {"type": "string", "minLength": 1, "maxLength": 1000},
    },
    "required": ["scores", "failure_types", "recommended_retry_stage", "feedback"],
}
