BEGIN;

-- 기존 public.embedding_vector_1024 컬럼을 현재 dev/prd 스키마 소유 도메인으로
-- 전환합니다. 실행 전에 search_path의 첫 번째 항목을 대상 스키마로 설정해야 합니다.
DO $$
DECLARE
    target_schema TEXT := current_schema();
    embeddings_table REGCLASS;
    service_view REGCLASS;
    current_type_schema TEXT;
    view_definition TEXT;
    view_owner TEXT;
    view_comment TEXT;
    view_acl ACLITEM[];
    grant_record RECORD;
    grantee_sql TEXT;
BEGIN
    IF target_schema IS NULL OR target_schema = 'public' THEN
        RAISE EXCEPTION
            'Set search_path to the application schema first (for example: dev, public or prd, public).';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
         WHERE t.typname = 'embedding_vector_1024'
           AND n.nspname = target_schema
    ) THEN
        IF EXISTS (
            SELECT 1
              FROM pg_type t
              JOIN pg_namespace n ON n.oid = t.typnamespace
             WHERE t.typname = 'vector'
               AND n.nspname = 'cdb_admin'
        ) THEN
            EXECUTE format(
                'CREATE DOMAIN %I.embedding_vector_1024 AS cdb_admin.vector(1024)',
                target_schema
            );
        ELSE
            EXECUTE 'CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public';
            EXECUTE format(
                'CREATE DOMAIN %I.embedding_vector_1024 AS public.vector(1024)',
                target_schema
            );
        END IF;
    END IF;

    embeddings_table := to_regclass(
        format('%I.%I', target_schema, 'popcorn_movie_embeddings')
    );
    IF embeddings_table IS NULL THEN
        RAISE EXCEPTION 'Table %.popcorn_movie_embeddings does not exist.', target_schema;
    END IF;

    SELECT type_namespace.nspname
      INTO current_type_schema
      FROM pg_attribute attribute
      JOIN pg_type column_type ON column_type.oid = attribute.atttypid
      JOIN pg_namespace type_namespace ON type_namespace.oid = column_type.typnamespace
     WHERE attribute.attrelid = embeddings_table
       AND attribute.attname = 'embedding'
       AND NOT attribute.attisdropped;

    IF current_type_schema IS DISTINCT FROM target_schema THEN
        service_view := to_regclass(
            format('%I.%I', target_schema, 'popcorn_movies_service')
        );
        IF service_view IS NOT NULL THEN
            SELECT pg_get_viewdef(view_relation.oid, TRUE),
                   pg_get_userbyid(view_relation.relowner),
                   obj_description(view_relation.oid, 'pg_class'),
                   view_relation.relacl
              INTO view_definition, view_owner, view_comment, view_acl
              FROM pg_class view_relation
             WHERE view_relation.oid = service_view;

            EXECUTE format(
                'DROP VIEW %I.popcorn_movies_service',
                target_schema
            );
        END IF;

        EXECUTE format(
            'ALTER TABLE %I.popcorn_movie_embeddings '
            'ALTER COLUMN embedding TYPE %I.embedding_vector_1024 '
            'USING embedding::text::%I.embedding_vector_1024',
            target_schema,
            target_schema,
            target_schema
        );

        IF service_view IS NOT NULL THEN
            EXECUTE format(
                'CREATE VIEW %I.popcorn_movies_service AS %s',
                target_schema,
                view_definition
            );

            IF view_comment IS NOT NULL THEN
                EXECUTE format(
                    'COMMENT ON VIEW %I.popcorn_movies_service IS %L',
                    target_schema,
                    view_comment
                );
            END IF;

            -- DROP/CREATE로 사라지는 명시적 ACL을 새 뷰에 복원합니다.
            FOR grant_record IN
                SELECT privilege_type, grantee, is_grantable
                  FROM aclexplode(view_acl)
            LOOP
                grantee_sql := CASE
                    WHEN grant_record.grantee = 0 THEN 'PUBLIC'
                    ELSE format('%I', pg_get_userbyid(grant_record.grantee))
                END;
                EXECUTE format(
                    'GRANT %s ON TABLE %I.popcorn_movies_service TO %s%s',
                    grant_record.privilege_type,
                    target_schema,
                    grantee_sql,
                    CASE WHEN grant_record.is_grantable
                         THEN ' WITH GRANT OPTION'
                         ELSE ''
                    END
                );
            END LOOP;

            -- 권한을 복원한 뒤 원래 소유자에게 다시 이전합니다.
            EXECUTE format(
                'ALTER VIEW %I.popcorn_movies_service OWNER TO %I',
                target_schema,
                view_owner
            );
        END IF;
    END IF;
END $$;

COMMIT;
