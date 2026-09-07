from __future__ import annotations

from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    message: str = Field(min_length=1, max_length=2000)
    session_id: UUID | None = None
    exclude_spoilers: bool = True
    include_trace: bool = False


class ChatEvidence(BaseModel):
    review_count: int = 0
    spoiler_included: bool = False
    personalization_applied: bool = False
    generated_at: str


class ChatResponse(BaseModel):
    session_id: str
    intent: str
    answer: str
    evidence: ChatEvidence
    sources: list[dict[str, Any]] = Field(default_factory=list)
    trace: list[dict[str, Any]] = Field(default_factory=list)
