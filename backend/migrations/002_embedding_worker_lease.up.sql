BEGIN;

DO $$
BEGIN
    IF current_schema() IS NULL OR current_schema() = 'public' THEN
        RAISE EXCEPTION
            'Set search_path to the application schema first (for example: dev, public or prd, public).';
    END IF;
END $$;

ALTER TABLE movie_embedding_jobs
    ADD COLUMN IF NOT EXISTS lease_token UUID,
    ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_movie_embedding_jobs_lease_recovery
    ON movie_embedding_jobs (lease_expires_at, id)
    WHERE status = 'PROCESSING';

COMMIT;
