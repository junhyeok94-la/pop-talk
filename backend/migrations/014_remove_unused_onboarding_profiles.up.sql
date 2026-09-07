BEGIN;

-- Onboarding preferences are stored directly on users as movie category IDs.
-- This legacy table is intentionally no longer part of the WAS data model.
DROP TABLE IF EXISTS onboarding_profiles;

COMMIT;
