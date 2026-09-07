import type { ChatResponse } from "@/lib/chat";
import { getAuthSession } from "@/lib/auth/server";

const CHAT_API_ORIGIN =
  process.env.CHAT_API_ORIGIN ??
  "http://popcorn-private-alb-144239326-fdd5172f3bd6.kr.lb.naverncp.com:8000";

const UPSTREAM_TIMEOUT_MS = 120_000;

export const maxDuration = 130;

interface ChatRequestBody {
  message?: unknown;
  exclude_spoilers?: unknown;
  include_trace?: unknown;
}

export async function POST(request: Request) {
  let body: ChatRequestBody;

  try {
    body = (await request.json()) as ChatRequestBody;
  } catch {
    return Response.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";

  if (!message) {
    return Response.json({ error: "추천받을 내용을 입력해주세요." }, { status: 400 });
  }

  // 클라이언트가 보낸 파라미터를 그대로 upstream으로 전달 (없으면 기본값)
  const excludeSpoilers =
    typeof body.exclude_spoilers === "boolean" ? body.exclude_spoilers : true;
  const includeTrace =
    typeof body.include_trace === "boolean" ? body.include_trace : false;

  // 로그인 상태면 Bearer JWT 를 실어 보낸다
  const session = await getAuthSession();

  try {
    const upstream = await fetch(`${CHAT_API_ORIGIN}/api/chat`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(session
          ? { Authorization: `Bearer ${session.token}` }
          : {}),
      },
      body: JSON.stringify({
        message,
        exclude_spoilers: excludeSpoilers,
        include_trace: includeTrace,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });

    if (!upstream.ok) {
      console.error(`[chat] upstream error: HTTP ${upstream.status}`);
      return Response.json(
        { error: "추천 서버에서 답변을 받아오지 못했습니다." },
        { status: upstream.status },
      );
    }

    const data = (await upstream.json()) as Partial<ChatResponse>;

    if (
      typeof data.answer !== "string" ||
      typeof data.session_id !== "string" ||
      typeof data.intent !== "string"
    ) {
      console.error("[chat] invalid upstream response");
      return Response.json(
        { error: "추천 서버의 응답 형식이 올바르지 않습니다." },
        { status: 502 },
      );
    }

    const response: ChatResponse = {
      session_id: data.session_id,
      intent: data.intent,
      answer: data.answer,
      evidence: data.evidence ?? {
        review_count: 0,
        spoiler_included: false,
        generated_at: new Date().toISOString(),
      },
      sources: Array.isArray(data.sources) ? data.sources : [],
    };

    return Response.json(response);
  } catch (error) {
    const timedOut =
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError");

    console.error("[chat] request failed:", error);
    return Response.json(
      {
        error: timedOut
          ? "답변 생성 시간이 초과되었습니다. 잠시 후 다시 시도해주세요."
          : "추천 서버에 연결할 수 없습니다.",
      },
      { status: timedOut ? 504 : 502 },
    );
  }
}

