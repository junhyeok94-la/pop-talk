export interface ChatSource {
  type: string;
  movie_id: number;
}

export interface ChatEvidence {
  review_count: number;
  spoiler_included: boolean;
  generated_at: string;
}

/** 브라우저에 전달하는 채팅 API 응답. trace는 서버 내부에서만 사용한다. */
export interface ChatResponse {
  session_id: string;
  intent: string;
  answer: string;
  evidence: ChatEvidence;
  sources: ChatSource[];
}

