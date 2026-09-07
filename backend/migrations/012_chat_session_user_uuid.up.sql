-- 012: Associate authenticated UUID users with chatbot sessions.

BEGIN;

DO $$
BEGIN
    IF current_schema() IS NULL OR current_schema() = 'public' THEN
        RAISE EXCEPTION
            'Set search_path to the application schema first (for example: dev, public or prd, public).';
    END IF;
    IF EXISTS (SELECT 1 FROM chat_sessions WHERE user_id IS NOT NULL) THEN
        RAISE EXCEPTION
            'chat_sessions.user_id contains legacy BIGINT values; migrate them explicitly before applying 012.';
    END IF;
END $$;

DROP INDEX IF EXISTS idx_chat_sessions_user_updated;

ALTER TABLE chat_sessions
    DROP COLUMN user_id;

ALTER TABLE chat_sessions
    ADD COLUMN user_id UUID NULL,
    ADD CONSTRAINT fk_chat_sessions_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX idx_chat_sessions_user_updated
    ON chat_sessions (user_id, updated_at DESC)
    WHERE user_id IS NOT NULL;

COMMENT ON COLUMN chat_sessions.user_id IS
    'Authenticated owner from users.id. NULL identifies an anonymous chat session.';

COMMIT;
