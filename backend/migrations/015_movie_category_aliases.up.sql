-- Personalization search terms owned by each onboarding movie category.
-- The column may already exist in environments where it was added manually.
ALTER TABLE movie_categories
    ADD COLUMN IF NOT EXISTS aliases TEXT[] NOT NULL DEFAULT '{}'::text[];

COMMENT ON COLUMN movie_categories.aliases IS
    '온보딩 선호를 의미 기반 영화 검색어로 확장하는 동의어·분위기·관람 맥락 목록';

UPDATE movie_categories
   SET aliases = CASE code
       WHEN 'ADAPTED' THEN ARRAY['원작 기반', '소설 원작', '만화 원작', '웹툰 원작', '베스트셀러 원작']
       WHEN 'TRUE_STORY' THEN ARRAY['실화 기반', '실제 사건', '실존 인물', '전기 영화']
       WHEN 'REVENGE' THEN ARRAY['복수극', '범죄', '납치', '실종', '형사', '살인', '추격', '범죄 스릴러']
       WHEN 'YOUTH' THEN ARRAY['청춘', '성장', '학교', '우정', '첫사랑', '청소년']
       WHEN 'PERIOD' THEN ARRAY['시대극', '사극', '조선 시대', '일제강점기', '역사']
       WHEN 'OCCULT' THEN ARRAY['오컬트', '귀신', '악령', '퇴마', '구마', '엑소시즘', '주술', '무속', '초자연 현상', '심령 미스터리']
       WHEN 'BLACKCOM' THEN ARRAY['블랙 코미디', '다크 코미디', '풍자', '냉소', '사회 풍자']
       WHEN 'AFTER_WORK' THEN ARRAY['퇴근 후', '가볍게 보기', '편안한 영화', '부담 없는 영화', '휴식']
       WHEN 'MOOD_LIFT' THEN ARRAY['기분 전환', '유쾌한 영화', '밝은 분위기', '웃긴 영화', '힐링', '활기']
       WHEN 'WITH_FAMILY' THEN ARRAY['가족과 함께', '가족 영화', '온 가족', '따뜻한 영화', '부모님과', '아이와']
       WHEN 'WITH_LOVER' THEN ARRAY['연인과 데이트', '데이트 영화', '로맨틱', '로맨스', '설렘', '커플']
       WHEN 'REWATCH' THEN ARRAY['다시 보기', '재관람', '여운이 긴 영화', '소장하고 싶은 영화', '여러 번 보기']
       WHEN 'ALONE' THEN ARRAY['혼자 보기', '혼영', '몰입', '조용한 영화', '사색적인 영화']
       WHEN 'WITH_FRIENDS' THEN ARRAY['친구와', '친구들과 보기', '우정', '여럿이 보기', '신나는 영화', '함께 웃는 영화']
       ELSE aliases
   END
 WHERE code IN (
       'ADAPTED', 'TRUE_STORY', 'REVENGE', 'YOUTH', 'PERIOD', 'OCCULT',
       'BLACKCOM', 'AFTER_WORK', 'MOOD_LIFT', 'WITH_FAMILY', 'WITH_LOVER',
       'REWATCH', 'ALONE', 'WITH_FRIENDS'
   );
