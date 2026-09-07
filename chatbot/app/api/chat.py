import logging
from datetime import datetime
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException

from app.agents.graph import movie_agent
from app.config import get_settings
from app.repositories.chat_repository import chat_repository
from app.schemas.chat import ChatEvidence, ChatRequest, ChatResponse
from app.security import optional_user_id


router = APIRouter(prefix="/api/chat", tags=["chat"])
logger = logging.getLogger("pop_talk.chatbot")


@router.post("", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    user_id: UUID | None = Depends(optional_user_id),
) -> ChatResponse:
    """챗봇 한 턴을 실행하고 사용자에게 보이는 결과를 저장한다.

    라우트는 문맥 조회, Agent 그래프 실행, 완성된 질의/답변 저장만 담당한다.
    의도 분기, 검색, 답변 생성은 ``agents.graph``에 둔다.
    """
    session_id = str(request.session_id or uuid4())
    try:
        # 질문 원문·CLOVA 프롬프트·리뷰 본문은 로그에 남기지 않는다.
        logger.info("chat request started session_id=%s", session_id)
        # "그 영화 평점은?" 같은 후속 질문에 사용할 문맥을 복원한다.
        context = await chat_repository.load_context(
            session_id=session_id,
            user_id=user_id,
        )
        user_preferences = (
            await chat_repository.load_user_preferences(user_id=user_id)
            if user_id is not None
            else {}
        )
        if user_id is not None and not user_preferences:
            raise HTTPException(status_code=401, detail="Authenticated user is unavailable.")
        result = await movie_agent.ainvoke(
            {
                "session_id": session_id,
                "user_id": str(user_id) if user_id else None,
                "user_preferences": user_preferences,
                "question": request.message,
                "exclude_spoilers": request.exclude_spoilers,
                "chat_history": context["chat_history"],
                "previous_movie_id": context["previous_movie_id"],
                "sources": [],
                "retrieved_reviews": [],
                "review_feedback": "",
                "retry_count": 0,
                "review_history": [],
                "trace": [],
            }
        )

        answer = result.get("answer", "답변을 생성하지 못했습니다.")
        intent = result.get("intent", "fallback")
        sources = result.get("sources", [])
        # 최종 답변과 근거가 확정된 뒤에만 저장한다.
        # ``save_exchange``는 사용자/어시스턴트 메시지를 하나의 트랜잭션으로 쓴다.
        await chat_repository.save_exchange(
            session_id=session_id,
            question=request.message,
            intent=intent,
            answer=answer,
            sources=sources,
            user_id=user_id,
        )
        logger.info(
            "chat request completed session_id=%s intent=%s review_count=%s source_count=%s",
            session_id,
            intent,
            len(result.get("retrieved_reviews", [])),
            len(sources),
        )
    except HTTPException:
        raise
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        logger.info("chat request rejected session_id=%s reason=%s", session_id, exc)
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("chat request failed session_id=%s", session_id)
        raise HTTPException(status_code=503, detail=f"Agent 실행 실패: {exc}") from exc

    reviews = result.get("retrieved_reviews", [])
    return ChatResponse(
        session_id=session_id,
        intent=intent,
        answer=answer,
        evidence=ChatEvidence(
            review_count=len(reviews),
            spoiler_included=any(bool(item.get("contains_spoiler")) for item in reviews),
            personalization_applied=bool(result.get("personalization_applied")),
            generated_at=datetime.now().astimezone().isoformat(),
        ),
        sources=sources,
        trace=(
            # trace는 개발 진단용이다. 클라이언트가 요청하더라도 운영 환경에서는
            # 절대 반환하지 않는다.
            result.get("trace", [])
            if request.include_trace and get_settings().app_env.lower() != "production"
            else []
        ),
    )
