/*
 * 영화 도메인 타입은 실제 DB(dev 스키마)의 컬럼명·타입을 그대로 따른다.
 * 화면에서 이름을 바꿔 쓰면 API를 붙일 때 매핑 층이 하나 더 생기므로 그러지 않는다.
 *
 * 회원·감상평·카테고리·관리자·푸시는 아직 DB에 테이블이 없다. 기획이 DB보다 앞서 있어
 * 이쪽은 기획안 기준으로 둔다.
 */

/** dev.movie_approval_status — 검수 축. REJECTED는 사유가 반드시 있어야 한다(DB CHECK 제약). */
export type MovieApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

/** dev.movie_service_status — 노출 축. 검수와 별개로 움직인다. */
export type MovieServiceStatus = 'DRAFT' | 'PUBLISHED' | 'HIDDEN'

/** dev.job_status — 배치·작업 큐 공용 */
export type JobStatus = 'PENDING' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED'

/** dev.embedding_status — STALE은 원문이 바뀌어 재생성이 필요한 상태다. */
export type EmbeddingStatus = 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED' | 'STALE'

/** dev.movie_media_type */
export type MovieMediaType = 'POSTER' | 'STILL'

export type LogAction = 'APPROVE' | 'REJECT' | 'RESTORE' | 'EDIT'

/** dev.popcorn_movies */
export interface Movie {
  id: number
  /** KOFIC 영화 코드. 필수·유니크한 원천 키다. */
  kofic_movie_cd: string
  kmdb_id?: string
  kmdb_matched: boolean
  title_ko: string
  title_en?: string
  title_original?: string
  release_date: string
  production_year?: number
  runtime_minutes?: number
  movie_type?: string
  production_status?: string
  production_countries: string[]
  representative_country?: string
  genres: string[]
  representative_genre?: string
  directors: string[]
  director_names_en: string[]
  actors: string[]
  actor_roles: string[]
  production_companies: string[]
  viewing_grade?: string
  poster_url?: string
  plot?: string
  source_keywords: string[]
  service_status: MovieServiceStatus
  approval_status: MovieApprovalStatus
  approved_by?: string
  approved_at?: string
  /** approval_status가 REJECTED면 비어 있을 수 없다. */
  rejection_reason?: string
  source_system: string
  /**
   * 원본 행 변경 감지를 위한 SHA-256. 배치가 채우고 admin은 읽기만 한다.
   * DB에서는 NOT NULL이지만 스냅샷은 이 컬럼이 생기기 전에 떠서 없다.
   * 화면에 쓰지 않으므로 선택 필드로 둔다.
   */
  source_hash?: string
  source_synced_at: string
  created_at: string
  updated_at: string

  /* ── popcorn_movies_service 뷰가 붙여주는 값 ── */
  /** PROFILE 임베딩이 READY이고 벡터가 실제로 있는지. 현재 5,985편 모두 false. */
  is_embedded?: boolean
  /** 포스터·스틸 전부. 영화당 평균 8.3개, 최대 53개. */
  media?: MovieMediaEntry[]

  /**
   * 비어 있는 필드 이름들. popcorn_movies_service 뷰가 세어 준다(마이그레이션 008).
   *
   * 영화 정보를 KOFIC과 KMDB 두 곳에서 모아 합치는데, 어느 쪽에도 없는 값이
   * 남는다. 무엇이 비었는지 화면이 알아야 운영자가 채울 수 있다.
   *
   * 스냅샷·목 데이터에는 없으므로 선택 필드다.
   */
  missing_fields?: string[]
  /** missing_fields가 비었는가. 뷰가 함께 준다. */
  is_complete?: boolean

  /**
   * 별칭으로 자동 분류된 카테고리(마이그레이션 007).
   *
   * categories와 다르다 — 그쪽은 운영자가 손으로 붙인 값이고, 이쪽은
   * movie_categories.aliases가 이 영화의 키워드와 겹쳐서 들어온 값이다.
   * 섞으면 무엇이 사람의 판단이고 무엇이 규칙인지 구분할 수 없다.
   *
   * 스냅샷·목에는 없어 선택 필드다.
   */
  auto_categories?: { code: string; name: string; type: string }[]

  /** 아직 popcorn_movies에 없는 컬럼. 추가 예정이라 화면에서는 계속 쓴다. */
  /** dev.movies.pop_talk_score. admin이 보는 popcorn_movies에는 없어 선택 필드다. */
  pop_talk_score?: number
  /** 카테고리도 테이블이 없다. 기획 기준으로 둔다. */
  categories: string[]
}

/** dev.popcorn_movies_service 뷰의 media jsonb 원소. */
export interface MovieMediaEntry {
  type: MovieMediaType
  url: string
  order: number
  primary: boolean
}

/** dev.popcorn_movie_media */
export interface MovieMedia {
  id: number
  movie_id: number
  media_type: MovieMediaType
  url: string
  display_order: number
  is_primary: boolean
  source_system: string
}

/**
 * popcorn_movie_embeddings — 추천은 1024차원 벡터 검색 기반이다.
 *
 * 생성은 CLOVA Studio Embedding v2가 하는데 embedding_model 컬럼에는 'bge-m3'가 들어간다.
 * 배치(embedding/worker.py)가 그렇게 넣고 popcorn_movies_service 뷰도 그 값으로 거른다.
 * 이름과 실제가 다르니 모델을 바꿀 때 이 값도 같이 봐야 한다.
 */
export interface MovieEmbedding {
  id: number
  movie_id: number
  document_type: string
  chunk_no: number
  embedding_model: string
  status: EmbeddingStatus
  content_hash: string
  attempts: number
  last_error?: string
  embedded_at?: string
  updated_at: string
}

/** dev.movie_embedding_jobs — 재시도 가능한 임베딩 작업 큐 */
export interface EmbeddingJob {
  id: number
  movie_id: number
  embedding_model: string
  operation: 'UPSERT' | 'DELETE'
  status: JobStatus
  attempts: number
  max_attempts: number
  last_error?: string
  available_at: string
  started_at?: string
  finished_at?: string
}

/** dev.reviews */
export interface Review {
  /** dev.reviews.id — uuid다. */
  id: string
  author: string
  movie: string
  /** 0.5 단위 별점. DB가 numeric(2,1) CHECK 0.5~5.0으로 막는다. */
  rating: number
  content: string
  created_at: string
  status: 'NORMAL' | 'HIDDEN' | 'DELETED'
  /**
   * 감상평이 어디서 온 것인가. dev.reviews.source_system을 그대로 나른다.
   *
   * **회원이 앱에서 직접 쓴 것은 비어 있다.** 마이그레이션 008의 CHECK가
   * source_system·source_user_key·source_review_key 셋을 묶어 두어서,
   * 전부 차 있거나 전부 비어 있거나 둘 중 하나다. 실 데이터에 이미 둘이
   * 섞여 있다 — 수집분은 'naver_movie', 회원 감상평은 NULL이다.
   */
  source_system?: string | null
}

export interface VerificationLog {
  id: number
  time: string
  admin: string
  movie: string
  action: LogAction
  before: MovieApprovalStatus
  after: MovieApprovalStatus
  note: string
}

/**
 * dev.display_categories — 사용자 앱의 알약 문구. 영화가 붙는 대상이다.
 * movie_count는 display_categories_service 뷰가 붙여준다.
 */
export interface Category {
  /**
   * 불변 유일 키. 문구에는 code가 없다(마이그레이션 011).
   *
   * 문구의 정체가 "어떤 카테고리들을 묶는가"로 바뀌면서 code가 설 자리를
   * 잃었다 — 카테고리를 바꾸면 code도 바뀌어야 하는데 code는 불변이었고,
   * 같은 조합의 문구를 둘 만들면 UNIQUE에 걸렸다.
   */
  id: number
  /** 알약을 누르면 입력창에 채워져 챗봇에게 보내지는 문장. */
  name: string
  /**
   * 알약 버튼에 보이는 짧은 이름(4~7자). 비면 알약으로 쓰지 않는다.
   *
   * name과 역할이 갈린다 — short_label은 버튼에 **보이는** 글자이고,
   * name은 **보내지는** 문장이다. 요구가 반대라 칸을 나눴다(009).
   */
  short_label?: string | null
  /**
   * 이 문구가 묶는 카테고리 코드들(마이그레이션 011).
   *
   * FK가 아니라 문자열 배열이라 DB가 존재를 보장하지 않는다 — 어드민 API가
   * 저장 전에 검사한다. 그래도 새어 들어온 것은 unknown_codes에 잡힌다.
   */
  category_codes: string[]
  /** 뷰가 붙여 주는 카테고리 이름들. category_codes와 같은 순서다. */
  category_names?: string[]
  /** 실재하지 않는 카테고리 코드. 비어 있는 것이 정상이다. */
  unknown_codes?: string[]
  description: string
  /**
   * 이 문구가 담는 영화 수. 뷰가 집계한다.
   *
   * 묶은 카테고리들의 영화 **합집합**이다. 교집합이 아닌 이유 — 상황
   * 카테고리는 별칭이 없어 0편이라, 교집합으로 세면 상황을 하나라도 묶는
   * 순간 무조건 0이 된다.
   */
  movie_count: number
  sort_order: number
  is_active: boolean
  created_by: string
  created_at: string
  updated_by?: string
  updated_at?: string
}

/** poster_url이 비어 있으면 대표 포스터를 찾아 쓴다. 실 데이터의 20%가 비어 있다. */
export function posterOf(movie: Movie, media: MovieMedia[] = MOCK_MOVIE_MEDIA) {
  if (movie.poster_url) return movie.poster_url
  // 뷰에서 온 데이터는 media를 직접 들고 있다.
  const fromView = movie.media?.find((m) => m.type === 'POSTER' && m.primary)?.url
  if (fromView) return fromView
  return media.find((m) => m.movie_id === movie.id && m.media_type === 'POSTER' && m.is_primary)?.url
}

/** 화면에서 감독은 대표 1명만 보여준다. directors는 배열이다. */
export function directorOf(movie: Movie) {
  return movie.directors[0] ?? '—'
}

/**
 * viewing_grade는 KOFIC 원문("12세이상관람가")이라 목록에서는 길다.
 * 상세에서는 원문을 그대로 쓰고, 목록에서만 줄인다.
 */
export function gradeLabel(movie: Movie) {
  const raw = movie.viewing_grade
  if (!raw) return '—'
  const age = raw.match(/(\d+)세/)
  if (age) return `${age[1]}세`
  if (raw.includes('전체')) return '전체'
  if (raw.includes('청소년')) return '청불'
  return raw
}

export function releaseYearOf(movie: Movie) {
  return movie.production_year ?? Number(movie.release_date.slice(0, 4))
}

export const MOCK_MOVIES: Movie[] = [
  {
    id: 1,
    kofic_movie_cd: '20228443',
    kmdb_id: 'K23001',
    kmdb_matched: true,
    title_ko: '서울의 봄',
    title_en: 'A Seoul Spring',
    title_original: '서울의 봄',
    release_date: '2023-11-22',
    production_year: 2023,
    runtime_minutes: 141,
    movie_type: '장편',
    production_status: '개봉',
    production_countries: ['한국'],
    representative_country: '한국',
    genres: ['드라마', '액션'],
    representative_genre: '드라마',
    directors: ['김성수'],
    director_names_en: ['Kim Sung-su'],
    actors: ['황정민', '정우성', '이성민', '박해준', '김성균'],
    actor_roles: ['전두광', '이태신', '정상호', '노태건', '김준엽'],
    production_companies: ['하이브미디어코프'],
    viewing_grade: '12세이상관람가',
    poster_url: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=300&h=450&fit=crop&auto=format',
    plot: '1979년 12월 12일, 군사반란을 막으려는 자와 반란을 일으키는 자들의 9시간의 긴박한 이야기를 담은 역사 드라마. 수도경비사령관 이태신과 전두광의 대결을 중심으로 대한민국의 운명이 걸린 하룻밤을 그린다.',
    source_keywords: ['군사반란', '실화', '1979'],
    service_status: 'PUBLISHED',
    approval_status: 'PENDING',
    source_system: 'KOFIC_KMDB',
    source_synced_at: '2026-08-01 09:12:34',
    created_at: '2026-08-01 09:12:34',
    updated_at: '2026-08-03 10:00:12',
    pop_talk_score: 92.5,
    categories: ['TRUE_STORY', 'PERIOD'],
  },
  {
    id: 2,
    kofic_movie_cd: '20234567',
    kmdb_id: 'K24002',
    kmdb_matched: true,
    title_ko: '파묘',
    title_en: 'Exhuma',
    release_date: '2024-02-22',
    production_year: 2024,
    runtime_minutes: 134,
    movie_type: '장편',
    production_status: '개봉',
    production_countries: ['한국'],
    representative_country: '한국',
    genres: ['공포', '미스터리'],
    representative_genre: '공포',
    directors: ['장재현'],
    director_names_en: ['Jang Jae-hyun'],
    actors: ['최민식', '김고은', '유해진', '이도현'],
    actor_roles: ['상덕', '화림', '영근', '봉길'],
    production_companies: ['쇼박스'],
    viewing_grade: '15세이상관람가',
    poster_url: 'https://images.unsplash.com/photo-1509248961158-e54f6934749c?w=300&h=450&fit=crop&auto=format',
    plot: '거액의 의뢰를 받은 무속인들이 수상한 묘를 이장하면서 벌어지는 기이한 사건을 다룬 오컬트 미스터리. 풍수사, 무속인, 장의사가 한 팀이 되어 거대한 비밀을 파헤친다.',
    source_keywords: ['오컬트', '무속', '묘'],
    service_status: 'PUBLISHED',
    approval_status: 'APPROVED',
    approved_by: '김운영',
    approved_at: '2026-08-05 14:20:33',
    source_system: 'KOFIC_KMDB',
    source_synced_at: '2026-07-20 10:05:17',
    created_at: '2026-07-20 10:05:17',
    updated_at: '2026-08-05 14:20:33',
    pop_talk_score: 88.0,
    categories: ['OCCULT'],
  },
  {
    id: 3,
    kofic_movie_cd: '20239876',
    kmdb_id: 'K24003',
    kmdb_matched: true,
    title_ko: '범죄도시4',
    title_en: 'The Roundup: Punishment',
    release_date: '2024-04-24',
    production_year: 2024,
    runtime_minutes: 109,
    movie_type: '장편',
    production_status: '개봉',
    production_countries: ['한국'],
    representative_country: '한국',
    genres: ['범죄', '액션'],
    representative_genre: '범죄',
    directors: ['허명행'],
    director_names_en: ['Heo Myeong-haeng'],
    actors: ['마동석', '김무열', '이동휘'],
    actor_roles: ['마석도', '백창기', '장동철'],
    production_companies: ['비에이엔터테인먼트'],
    viewing_grade: '15세이상관람가',
    poster_url: 'https://images.unsplash.com/photo-1485846234645-a62644f84728?w=300&h=450&fit=crop&auto=format',
    plot: '마석도와 서울 광역수사대가 온라인 불법 도박 조직을 소탕하기 위해 나선 이야기. 국제 사이버 범죄까지 확장되는 마석도의 주먹 활약.',
    source_keywords: ['형사', '액션', '도박'],
    service_status: 'PUBLISHED',
    approval_status: 'PENDING',
    source_system: 'KOFIC_KMDB',
    source_synced_at: '2026-08-03 11:44:02',
    created_at: '2026-08-03 11:44:02',
    updated_at: '2026-08-04 16:30:00',
    pop_talk_score: 85.0,
    categories: ['REVENGE'],
  },
  {
    id: 4,
    kofic_movie_cd: '20225544',
    kmdb_id: 'K23004',
    kmdb_matched: true,
    title_ko: '다음 소희',
    title_en: 'Next Sohee',
    release_date: '2023-02-08',
    production_year: 2023,
    runtime_minutes: 138,
    movie_type: '장편',
    production_status: '개봉',
    production_countries: ['한국'],
    representative_country: '한국',
    genres: ['드라마'],
    representative_genre: '드라마',
    directors: ['정주리'],
    director_names_en: ['July Jung'],
    actors: ['배두나', '김시은'],
    actor_roles: ['유진', '소희'],
    production_companies: ['트윈플러스파트너스'],
    viewing_grade: '15세이상관람가',
    poster_url: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=300&h=450&fit=crop&auto=format',
    plot: '콜센터 현장실습을 나간 소희가 사망하고, 형사 유진이 그 진실을 파헤치는 이야기. 현장실습 제도의 문제점을 날카롭게 고발한 사회파 드라마.',
    source_keywords: ['사회고발', '현장실습', '노동'],
    service_status: 'PUBLISHED',
    approval_status: 'PENDING',
    source_system: 'KOFIC_KMDB',
    source_synced_at: '2026-07-28 08:30:55',
    created_at: '2026-07-28 08:30:55',
    updated_at: '2026-08-05 11:10:00',
    pop_talk_score: 82.5,
    categories: ['TRUE_STORY'],
  },
  {
    id: 5,
    kofic_movie_cd: '20211122',
    kmdb_id: 'K22005',
    kmdb_matched: true,
    title_ko: '헤어질 결심',
    title_en: 'Decision to Leave',
    release_date: '2022-06-29',
    production_year: 2022,
    runtime_minutes: 138,
    movie_type: '장편',
    production_status: '개봉',
    production_countries: ['한국'],
    representative_country: '한국',
    genres: ['멜로', '미스터리'],
    representative_genre: '멜로',
    directors: ['박찬욱'],
    director_names_en: ['Park Chan-wook'],
    actors: ['박해일', '탕웨이'],
    actor_roles: ['해준', '서래'],
    production_companies: ['모호필름'],
    viewing_grade: '15세이상관람가',
    poster_url: 'https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?w=300&h=450&fit=crop&auto=format',
    plot: '산에서 발생한 추락사를 수사하게 된 형사가 사망자의 아내를 수상히 여기며 그녀에게 빠져드는 이야기. 박찬욱 감독 특유의 섬세한 감성과 미스터리가 결합된 작품.',
    source_keywords: ['미스터리', '멜로', '형사'],
    service_status: 'PUBLISHED',
    approval_status: 'APPROVED',
    approved_by: '이검수',
    approved_at: '2026-07-22 09:15:07',
    source_system: 'KOFIC_KMDB',
    source_synced_at: '2026-07-15 13:22:48',
    created_at: '2026-07-15 13:22:48',
    updated_at: '2026-07-22 09:15:07',
    pop_talk_score: 89.0,
    categories: ['REVENGE'],
  },
  {
    id: 6,
    kofic_movie_cd: '20228899',
    kmdb_matched: false,
    title_ko: '콘크리트 유토피아',
    title_en: 'Concrete Utopia',
    release_date: '2023-08-09',
    production_year: 2023,
    runtime_minutes: 130,
    movie_type: '장편',
    production_status: '개봉',
    production_countries: ['한국'],
    representative_country: '한국',
    genres: ['드라마', 'SF'],
    representative_genre: '드라마',
    directors: ['엄태화'],
    director_names_en: ['Um Tae-hwa'],
    actors: ['이병헌', '박서준', '박보영'],
    actor_roles: ['영탁', '민성', '명화'],
    production_companies: ['클라이맥스스튜디오'],
    viewing_grade: '15세이상관람가',
    poster_url: 'https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b?w=300&h=450&fit=crop&auto=format',
    plot: '대지진으로 폐허가 된 서울에서 유일하게 남은 아파트 황궁 아파트 주민들과 외부인들 사이에서 벌어지는 생존 드라마.',
    source_keywords: ['재난', '생존', '아파트'],
    service_status: 'DRAFT',
    approval_status: 'PENDING',
    source_system: 'KOFIC_KMDB',
    source_synced_at: '2026-08-04 16:58:21',
    created_at: '2026-08-04 16:58:21',
    updated_at: '2026-08-04 16:58:21',
    pop_talk_score: 80.0,
    categories: ['TRUE_STORY'],
  },
]

/** 대표 포스터는 영화당 하나만 존재할 수 있다(DB 유니크 인덱스). */
export const MOCK_MOVIE_MEDIA: MovieMedia[] = [
  { id: 1, movie_id: 1, media_type: 'POSTER', url: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=300&h=450&fit=crop&auto=format', display_order: 0, is_primary: true, source_system: 'KMDB' },
  { id: 2, movie_id: 2, media_type: 'POSTER', url: 'https://images.unsplash.com/photo-1509248961158-e54f6934749c?w=300&h=450&fit=crop&auto=format', display_order: 0, is_primary: true, source_system: 'KMDB' },
  { id: 3, movie_id: 3, media_type: 'POSTER', url: 'https://images.unsplash.com/photo-1485846234645-a62644f84728?w=300&h=450&fit=crop&auto=format', display_order: 0, is_primary: true, source_system: 'KMDB' },
]

export const MOCK_MOVIE_EMBEDDINGS: MovieEmbedding[] = [
  { id: 1, movie_id: 1, document_type: 'PROFILE', chunk_no: 0, embedding_model: 'bge-m3', status: 'READY', content_hash: 'a1f3c8e2', attempts: 1, embedded_at: '2026-08-01 09:15:02', updated_at: '2026-08-01 09:15:02' },
  { id: 2, movie_id: 2, document_type: 'PROFILE', chunk_no: 0, embedding_model: 'bge-m3', status: 'READY', content_hash: 'b7d2e910', attempts: 1, embedded_at: '2026-07-20 10:09:41', updated_at: '2026-07-20 10:09:41' },
  { id: 3, movie_id: 3, document_type: 'PROFILE', chunk_no: 0, embedding_model: 'bge-m3', status: 'PENDING', content_hash: 'c3a8f451', attempts: 0, updated_at: '2026-08-03 11:44:10' },
  { id: 4, movie_id: 4, document_type: 'PROFILE', chunk_no: 0, embedding_model: 'bge-m3', status: 'READY', content_hash: 'd9b1c722', attempts: 2, embedded_at: '2026-07-28 08:35:18', updated_at: '2026-07-28 08:35:18' },
  { id: 5, movie_id: 5, document_type: 'PROFILE', chunk_no: 0, embedding_model: 'bge-m3', status: 'READY', content_hash: 'e4c0a638', attempts: 1, embedded_at: '2026-07-15 13:26:55', updated_at: '2026-07-15 13:26:55' },
  { id: 6, movie_id: 6, document_type: 'PROFILE', chunk_no: 0, embedding_model: 'bge-m3', status: 'FAILED', content_hash: 'f2e7b104', attempts: 3, last_error: '임베딩 서버 응답 없음 (timeout 30s)', updated_at: '2026-08-04 17:02:40' },
]

export const MOCK_EMBEDDING_JOBS: EmbeddingJob[] = [
  { id: 1, movie_id: 3, embedding_model: 'bge-m3', operation: 'UPSERT', status: 'PENDING', attempts: 0, max_attempts: 3, available_at: '2026-08-03 11:44:10' },
  { id: 2, movie_id: 6, embedding_model: 'bge-m3', operation: 'UPSERT', status: 'FAILED', attempts: 3, max_attempts: 3, last_error: '임베딩 서버 응답 없음 (timeout 30s)', available_at: '2026-08-04 17:02:40', started_at: '2026-08-04 17:02:10', finished_at: '2026-08-04 17:02:40' },
]

export const MOCK_LOGS: VerificationLog[] = [
  { id: 1, time: '2026-08-05 14:20', admin: '김운영', movie: '파묘', action: 'APPROVE', before: 'PENDING', after: 'APPROVED', note: '' },
  { id: 2, time: '2026-08-05 13:30', admin: '이검수', movie: '헤어질 결심', action: 'APPROVE', before: 'PENDING', after: 'APPROVED', note: '' },
  { id: 3, time: '2026-08-05 11:10', admin: '이검수', movie: '다음 소희', action: 'EDIT', before: 'PENDING', after: 'PENDING', note: '카테고리 추가' },
  { id: 4, time: '2026-08-04 16:30', admin: '이검수', movie: '범죄도시4', action: 'EDIT', before: 'PENDING', after: 'PENDING', note: '카테고리 수정' },
  { id: 5, time: '2026-08-03 10:00', admin: '김운영', movie: '서울의 봄', action: 'EDIT', before: 'PENDING', after: 'PENDING', note: '팝콘점수 조정' },
  { id: 6, time: '2026-07-22 09:15', admin: '이검수', movie: '헤어질 결심', action: 'APPROVE', before: 'PENDING', after: 'APPROVED', note: '' },
  { id: 7, time: '2026-07-20 15:40', admin: '김운영', movie: '파묘', action: 'EDIT', before: 'PENDING', after: 'PENDING', note: '줄거리 수정' },
]

export const MOCK_CATEGORIES: Category[] = [
  { id: 1, short_label: '가족과 함께', name: '가족이 다 같이 볼 수 있는 영화를 찾고 있어요.', category_codes: ['WITH_FAMILY'], description: '온 가족이 함께 즐길 수 있는 영화', movie_count: 3, sort_order: 1, is_active: true, created_by: '김운영', created_at: '2026-01-05 10:00:00' },
  { id: 2, short_label: '통쾌한 액션', name: '답답한 게 통쾌하게 풀리는 범죄·액션 영화를 추천해 주세요.', category_codes: ['REVENGE'], description: '스트레스 해소에 딱인 통쾌한 영화', movie_count: 2, sort_order: 2, is_active: true, created_by: '김운영', created_at: '2026-01-05 10:05:22', updated_by: '이검수', updated_at: '2026-03-10 14:31:08' },
  { id: 3, short_label: '실화 바탕', name: '실제로 있었던 일을 다룬 실화 바탕 영화가 보고 싶어요.', category_codes: ['TRUE_STORY', 'PERIOD'], description: '역사적 사실을 바탕으로 한 영화', movie_count: 2, sort_order: 3, is_active: true, created_by: '김운영', created_at: '2026-01-05 10:10:44' },
  { id: 4, short_label: '오컬트', name: '등골 서늘한 한국식 공포·오컬트 영화를 추천해 주세요.', category_codes: ['OCCULT'], description: '한국 특유의 공포와 오컬트 요소', movie_count: 1, sort_order: 4, is_active: true, created_by: '이검수', created_at: '2026-02-01 09:20:15' },
  { id: 5, short_label: '퇴근 후 힐링', name: '퇴근하고 편하게 쉬면서 볼 영화가 필요해요.', category_codes: ['AFTER_WORK'], description: '하루 끝에 부담 없이 보는 영화', movie_count: 1, sort_order: 5, is_active: true, created_by: '이검수', created_at: '2026-02-01 09:25:37', updated_by: '김운영', updated_at: '2026-05-20 11:48:52' },
  { id: 6, short_label: '원작 영화', name: '소설이나 웹툰이 원작인 영화를 보고 싶어요.', category_codes: ['ADAPTED'], description: '원작이 있는 영화', movie_count: 0, sort_order: 6, is_active: true, created_by: '김운영', created_at: '2026-03-15 15:02:30' },
]

/**
 * dev.movie_categories — 관리자용 내부 분류.
 * 영화와 잇는 연결 테이블이 없어 '영화수'가 없다. 영화에 붙는 것은 Category다.
 */
/**
 * 카테고리 분류. DB의 CHECK 제약(movie_categories_type_check)과 같은 값이다.
 *
 * **여기가 단일 출처다.** API 검증(lib/movie-categories.ts)도 화면 드롭다운도
 * 이것을 가져다 쓴다. 전에는 두 군데에 따로 적어 두었다가 SITUATION을 더할 때
 * 화면만 고쳐, 운영자가 '상황'을 고르고 저장하면 422가 나는 상태가 됐다.
 *
 * 서버 모듈이 아니라 여기에 두는 이유 — lib/movie-categories.ts는
 * server-only다. 클라이언트 컴포넌트인 카테고리 화면이 거기서 값을 가져오면
 * 빌드가 깨진다. 단일 출처는 양쪽이 다 읽을 수 있는 자리에 있어야 한다.
 *
 * SITUATION은 파이썬 WAS가 모른다(MovieCategoryCreate가 넷만 받는다).
 * 읽기는 통과하지만 WAS로는 만들 수 없어, 상황 카테고리는 어드민에서만
 * 만들 수 있다.
 */
export const CATEGORY_TYPES = ['GENRE', 'MOOD', 'THEME', 'RATING', 'SITUATION'] as const

export type CategoryType = (typeof CATEGORY_TYPES)[number]

export interface MovieCategory {
  id: number
  code: string
  name: string
  type: CategoryType
  description: string
  /**
   * 의미 검색용 어구. **어드민은 읽기만 한다.**
   *
   * WAS가 온보딩 선호를 임베딩 검색어로 넓힐 때 쓴다('소설 원작'처럼 띄어쓴
   * 자연스러운 말). 자동 분류는 match_keywords가 담당한다 — 013 전까지 이
   * 칸을 함께 쓰다가 WAS 시드에 덮어써져 분류가 343편에서 124편으로
   * 떨어진 적이 있다.
   */
  aliases?: string[]
  /**
   * 자동 분류용 낱말(마이그레이션 013).
   *
   * popcorn_movies.source_keywords와 **배열 정확 일치**로 겹치면 그 영화가
   * 이 카테고리에 든다. 예) 원작이 있는 작품 → {소설원작, 만화원작}
   *
   * 정확 일치라 수집처 표기 그대로여야 한다 — '소설원작'은 걸리고
   * '소설 원작'은 안 걸린다. 5,312편을 손으로 붙일 수 없으므로 사실상
   * 유일한 분류 수단이다.
   */
  match_keywords?: string[]
  sort_order: number
  is_active: boolean
  created_by: string
  created_at: string
  updated_by?: string
  updated_at?: string
}

export const MOCK_MOVIE_CATEGORIES: MovieCategory[] = [
  { id: 1, code: 'DRAMA', name: '드라마', type: 'GENRE', description: '현실적인 인물과 사건을 그린 장르', sort_order: 1, is_active: true, created_by: '김운영', created_at: '2026-01-01 09:00:00' },
  { id: 2, code: 'ACTION', name: '액션', type: 'GENRE', description: '박진감 넘치는 액션이 주를 이루는 장르', sort_order: 2, is_active: true, created_by: '김운영', created_at: '2026-01-01 09:03:11', updated_by: '이검수', updated_at: '2026-04-10 16:22:05' },
  { id: 3, code: 'HORROR', name: '공포', type: 'GENRE', description: '공포와 긴장감을 유발하는 장르', sort_order: 3, is_active: true, created_by: '김운영', created_at: '2026-01-01 09:06:44' },
  { id: 4, code: 'MYSTERY', name: '미스터리', type: 'GENRE', description: '수수께끼와 미스터리를 다루는 장르', sort_order: 4, is_active: true, created_by: '이검수', created_at: '2026-01-01 09:10:28' },
  { id: 5, code: 'CRIME', name: '범죄', type: 'GENRE', description: '범죄와 수사를 다루는 장르', sort_order: 5, is_active: true, created_by: '이검수', created_at: '2026-01-01 09:14:53' },
  { id: 6, code: 'ROMANCE', name: '멜로/로맨스', type: 'GENRE', description: '사랑과 감성을 다루는 장르', sort_order: 6, is_active: true, created_by: '김운영', created_at: '2026-01-01 09:18:37' },
  { id: 7, code: 'THRILLER', name: '스릴러', type: 'MOOD', description: '긴장감과 서스펜스가 넘치는 분위기', sort_order: 7, is_active: true, created_by: '김운영', created_at: '2026-02-01 10:30:00', updated_by: '김운영', updated_at: '2026-06-01 13:05:19' },
  { id: 8, code: 'HEALING', name: '힐링', type: 'MOOD', description: '마음을 치유하는 따뜻한 분위기', sort_order: 8, is_active: true, created_by: '이검수', created_at: '2026-02-01 10:35:42' },
  { id: 9, code: 'SOCIAL', name: '사회고발', type: 'THEME', description: '사회적 문제를 직시하는 테마', sort_order: 9, is_active: true, created_by: '이검수', created_at: '2026-03-01 11:00:00' },
  { id: 10, code: 'HISTORICAL', name: '역사/시대극', type: 'THEME', description: '역사적 배경을 기반으로 한 테마', sort_order: 10, is_active: true, created_by: '김운영', created_at: '2026-03-01 11:08:29' },
  { id: 11, code: 'RATING_12', name: '12세 이상', type: 'RATING', description: '12세 이상 관람 가능', sort_order: 11, is_active: true, created_by: '김운영', created_at: '2026-01-01 09:22:01' },
  { id: 12, code: 'RATING_15', name: '15세 이상', type: 'RATING', description: '15세 이상 관람 가능', sort_order: 12, is_active: true, created_by: '김운영', created_at: '2026-01-01 09:25:44', updated_by: '이검수', updated_at: '2026-07-15 17:44:12' },
]

/*
 * source_system을 일부러 섞어 둔다. DB 없이 목으로 도는 동안에도 출처 열의
 * 두 갈래(수집분 · 회원 직접 작성)가 모두 화면에 나와야, 회원 감상평이
 * 들어오기 전에 표시가 틀어진 것을 알아챌 수 있다.
 */
export const MOCK_REVIEWS: Review[] = [
  { id: '22222222-0000-4000-8000-000000000001', author: '팝콘러버', movie: '서울의 봄', rating: 5.0, content: '역대급 긴장감. 마지막 장면에서 손에 땀을 쥐었습니다. 황정민의 연기는 정말 소름.', created_at: '2026-08-05', status: 'NORMAL', source_system: 'naver_movie' },
  { id: '22222222-0000-4000-8000-000000000002', author: '무비매니아', movie: '파묘', rating: 4.5, content: '한국 오컬트의 새 지평. 최민식 선생님의 카리스마가 압도적이었습니다. 강추!', created_at: '2026-08-04', status: 'NORMAL', source_system: 'naver_movie' },
  { id: '22222222-0000-4000-8000-000000000003', author: '영화광123', movie: '범죄도시4', rating: 4.0, content: '마동석은 역시 믿고 보는 배우. 액션씬이 시원시원해서 스트레스 확 풀렸어요.', created_at: '2026-08-04', status: 'NORMAL', source_system: 'naver_movie' },
  { id: '22222222-0000-4000-8000-000000000004', author: '씨네필', movie: '파묘', rating: 3.5, content: '후반부가 좀 아쉽긴 했지만 전반적으로 잘 만든 영화. 다만 너무 과하게 평가받는 것 같기도...', created_at: '2026-08-03', status: 'NORMAL' },
  { id: '22222222-0000-4000-8000-000000000005', author: '악플러킹', movie: '서울의 봄', rating: 0.5, content: '스포) 결말이 너무 허무함. 이딴 영화가 천만이라니 한국 관객 수준이 의심됨ㅋㅋ', created_at: '2026-08-02', status: 'NORMAL' },
  { id: '22222222-0000-4000-8000-000000000006', author: '드라마퀸', movie: '다음 소희', rating: 4.5, content: '배두나의 연기는 언제나 옳다. 무거운 주제지만 꼭 봐야 할 영화. 마음이 너무 아팠어요.', created_at: '2026-08-01', status: 'NORMAL' },
  { id: '22222222-0000-4000-8000-000000000007', author: '광고계정', movie: '범죄도시4', rating: 5.0, content: '진짜 레전드 영화 여기서 티켓 싸게 사세요 → bit.ly/xxxxx', created_at: '2026-07-31', status: 'HIDDEN' },
]

export type MemberStatus = 'ACTIVE' | 'SUSPENDED' | 'WITHDRAWN'

export interface Member {
  /** dev.users.id — uuid다. 정수가 아니다. */
  id: string
  name: string
  email: string
  joined_at: string
  status: MemberStatus
  review_count: number
  status_updated_by?: string
  status_updated_at?: string
}

export const MOCK_MEMBERS: Member[] = [
  { id: '11111111-0000-4000-8000-000000000001', name: '팝콘러버', email: 'user@example.com', joined_at: '2026-01-12', status: 'ACTIVE', review_count: 23 },
  { id: '11111111-0000-4000-8000-000000000002', name: '무비매니아', email: 'user@example.com', joined_at: '2026-02-04', status: 'ACTIVE', review_count: 41 },
  { id: '11111111-0000-4000-8000-000000000003', name: '영화광123', email: 'user@example.com', joined_at: '2026-03-17', status: 'ACTIVE', review_count: 8 },
  { id: '11111111-0000-4000-8000-000000000004', name: '씨네필', email: 'user@example.com', joined_at: '2026-03-29', status: 'ACTIVE', review_count: 17 },
  { id: '11111111-0000-4000-8000-000000000005', name: '악플러킹', email: 'user@example.com', joined_at: '2026-04-05', status: 'SUSPENDED', review_count: 3, status_updated_by: '김운영', status_updated_at: '2026-08-02 10:14:27' },
  { id: '11111111-0000-4000-8000-000000000006', name: '드라마퀸', email: 'user@example.com', joined_at: '2026-04-22', status: 'ACTIVE', review_count: 14 },
  { id: '11111111-0000-4000-8000-000000000007', name: '광고계정', email: 'user@example.com', joined_at: '2026-05-01', status: 'SUSPENDED', review_count: 1, status_updated_by: '이검수', status_updated_at: '2026-08-01 09:03:51' },
  { id: '11111111-0000-4000-8000-000000000008', name: '영화좋아요', email: 'user@example.com', joined_at: '2026-05-14', status: 'ACTIVE', review_count: 6 },
  { id: '11111111-0000-4000-8000-000000000009', name: '리뷰왕', email: 'user@example.com', joined_at: '2026-06-03', status: 'ACTIVE', review_count: 55 },
  { id: '11111111-0000-4000-8000-000000000010', name: '탈퇴회원', email: 'user@example.com', joined_at: '2026-06-18', status: 'WITHDRAWN', review_count: 2, status_updated_by: '김운영', status_updated_at: '2026-07-20 15:22:09' },
  { id: '11111111-0000-4000-8000-000000000011', name: '조용한관객', email: 'user@example.com', joined_at: '2026-07-01', status: 'ACTIVE', review_count: 1 },
  { id: '11111111-0000-4000-8000-000000000012', name: '점수후해', email: 'user@example.com', joined_at: '2026-07-15', status: 'ACTIVE', review_count: 9 },
]

export const CURRENT_ADMIN = { id: 1, name: '김운영', email: 'admin@popcorn.kr', role: 'SUPER_ADMIN' }

/* ── 온보딩 설문 ─────────────────────────────────────────
 * Notion "온보딩 설문 & 추천 카테고리 설계" 기준.
 * Q1~Q3은 필수, Q4~Q6은 건너뛸 수 있다. 건너뛴 회원은 인기작 기반 콜드스타트로 진입한다.
 */

/*
 * 옛 설문 선택지(SURVEY_GENRES·WATCH_WITH·RATING_LIMITS·TOPICS·AVOID)는
 * 걷어냈다. Q1~Q6 문항 구조가 사라지면서 아무도 쓰지 않게 됐다.
 *
 * 회원가입은 이제 카테고리 복수 선택 하나만 묻는다. 선택지는 DB의
 * movie_categories가 갖고 있으므로 여기서 목록을 들고 있을 이유가 없다.
 * 옛 문항 설계는 Notion "온보딩 설문 & 추천 카테고리 설계"에 남아 있다.
 */

/**
 * 회원가입 온보딩 취향.
 *
 * **구조가 통째로 바뀌었다.** 전에는 Q1~Q6 문항별 자유 낱말 배열을
 * dev.onboarding_profiles에 담았는데, WAS가 그 테이블을 지우고 users에
 * 컬럼 둘로 옮겼다.
 *
 *   users.onboarding_status               NOT_STARTED · IN_PROGRESS · COMPLETED · SKIPPED
 *   users.onboarding_movie_category_ids   movie_categories.id 배열 (최대 20)
 *
 * 이제 회원가입에서 묻는 것은 **카테고리 복수 선택 하나**다. 인상 깊게 본
 * 영화·배우·감독·피하고 싶은 요소를 담을 자리가 없어졌다. 옛 문항 단위를
 * 그대로 두면 화면이 늘 "건너뜀"만 그린다.
 */
export interface MemberSurvey {
  /** DB의 CHECK가 허용하는 넷. */
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED'
  /** 고른 카테고리. 이름까지 풀어서 준다 — 화면이 id를 보여줄 수는 없다. */
  categories: { id: number; code: string; name: string; type: string }[]
}

export const MOCK_SURVEYS: Record<string, MemberSurvey> = {
  '11111111-0000-4000-8000-000000000001': { status: 'COMPLETED', categories: [{ id: 15, code: 'PERIOD', name: '시대극', type: 'THEME' }, { id: 13, code: 'REVENGE', name: '복수·범죄', type: 'THEME' }] },
  '11111111-0000-4000-8000-000000000002': { status: 'COMPLETED', categories: [{ id: 16, code: 'OCCULT', name: '오컬트', type: 'MOOD' }] },
  '11111111-0000-4000-8000-000000000003': { status: 'NOT_STARTED', categories: [] },
}

/* ── 배치 (dev.batch_runs) ────────────────────────────────
 * 한 테이블에서 job_name으로 구분한다. 지금은 한 종류뿐이다.
 *  - load-initial-movies: 영화 원장 수집. DB에 이미 있다(APScheduler).
 *
 * 취향 갱신 배치(refresh-member-preferences)는 일정상 개발 범위에서 빠졌다.
 * 되살릴 때는 docs/removed-features.md를 본다.
 */

export const BATCH_JOBS = {
  'load-initial-movies': '영화 데이터 수집',
} as const

export type BatchJobName = keyof typeof BATCH_JOBS

/** dev.batch_runs */
export interface BatchRun {
  id: number
  job_name: BatchJobName
  /** 실행 예정 시각. (job_name, scheduled_for)가 유니크다. */
  scheduled_for: string
  status: JobStatus
  source_file?: string
  processed_count: number
  inserted_count: number
  updated_count: number
  failed_count: number
  result: Record<string, number | string>
  last_error?: string
  started_at?: string
  finished_at?: string
  created_at: string
}

export const MOCK_BATCH_RUNS: BatchRun[] = [
  { id: 1, job_name: 'load-initial-movies', scheduled_for: '2026-08-07 02:00:00', status: 'SUCCEEDED', source_file: 'kofic_20260807.json', processed_count: 412, inserted_count: 6, updated_count: 31, failed_count: 0, result: { kmdb_matched: 405 }, started_at: '2026-08-07 02:00:03', finished_at: '2026-08-07 02:01:57', created_at: '2026-08-07 02:00:00' },
  { id: 3, job_name: 'load-initial-movies', scheduled_for: '2026-08-06 02:00:00', status: 'SUCCEEDED', source_file: 'kofic_20260806.json', processed_count: 388, inserted_count: 3, updated_count: 22, failed_count: 1, result: { kmdb_matched: 380 }, last_error: 'KMDB 매칭 실패 1건 (kofic_movie_cd=20241102)', started_at: '2026-08-06 02:00:02', finished_at: '2026-08-06 02:01:44', created_at: '2026-08-06 02:00:00' },
  { id: 7, job_name: 'load-initial-movies', scheduled_for: '2026-08-04 02:00:00', status: 'SUCCEEDED', source_file: 'kofic_20260804.json', processed_count: 401, inserted_count: 8, updated_count: 27, failed_count: 0, result: { kmdb_matched: 394 }, started_at: '2026-08-04 02:00:02', finished_at: '2026-08-04 02:01:51', created_at: '2026-08-04 02:00:00' },
]
