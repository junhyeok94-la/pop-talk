BEGIN;

DO $$
BEGIN
    IF current_schema() IS NULL OR current_schema() = 'public' THEN
        RAISE EXCEPTION
            'Set search_path to the application schema first (for example: dev, public or prd, public).';
    END IF;
END $$;

DO $$
BEGIN
    CREATE TYPE chat_role AS ENUM ('USER', 'ASSISTANT');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS chat_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id BIGINT,
    title VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_updated
    ON chat_sessions (user_id, updated_at DESC)
    WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS chat_messages (
    id BIGSERIAL PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role chat_role NOT NULL,
    content TEXT NOT NULL CHECK (length(btrim(content)) > 0),
    intent VARCHAR(50),
    sources JSONB NOT NULL DEFAULT '[]'::jsonb
        CHECK (jsonb_typeof(sources) = 'array'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session_created
    ON chat_messages (session_id, created_at DESC, id DESC);

COMMIT;
