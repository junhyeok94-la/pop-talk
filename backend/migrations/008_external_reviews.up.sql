BEGIN;

DO $$
BEGIN
    IF current_schema() IS NULL OR current_schema() = 'public' THEN
        RAISE EXCEPTION
            'Set search_path to the application schema first (for example: dev, public or prd, public).';
    END IF;
END $$;

-- External reviews do not belong to a Pop Talk member account. Keep the FK,
-- but allow user_id to be NULL only for these source-attributed records.
ALTER TABLE reviews
    ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE reviews
    ADD COLUMN IF NOT EXISTS source_system VARCHAR(32),
    ADD COLUMN IF NOT EXISTS source_user_key VARCHAR(64),
    ADD COLUMN IF NOT EXISTS source_review_key CHAR(64);

-- A SHA-256 import signature makes the import idempotent when the source has
-- no stable native review identifier.
CREATE UNIQUE INDEX IF NOT EXISTS uq_reviews_source_review_key
    ON reviews (source_review_key)
    WHERE source_review_key IS NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conrelid = 'reviews'::regclass
           AND conname = 'reviews_source_metadata_check'
    ) THEN
        ALTER TABLE reviews
            ADD CONSTRAINT reviews_source_metadata_check
            CHECK (
                (source_system IS NULL AND source_user_key IS NULL AND source_review_key IS NULL)
                OR
                (
                    source_system IS NOT NULL
                    AND length(btrim(source_system)) > 0
                    AND source_user_key IS NOT NULL
                    AND length(btrim(source_user_key)) > 0
                    AND source_review_key IS NOT NULL
                )
            );
    END IF;
END $$;

COMMENT ON COLUMN reviews.source_system IS
    'External review source. NULL for internal member reviews.';
COMMENT ON COLUMN reviews.source_user_key IS
    'External author key; unrelated to Pop Talk users.id.';
COMMENT ON COLUMN reviews.source_review_key IS
    'SHA-256 import signature used to prevent duplicate external reviews.';

COMMIT;
