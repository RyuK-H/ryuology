-- 에이전트 게임 00000001 「첫 발자국」 — D1 스키마
-- 적용: npx wrangler d1 execute ryuology-footprints --remote --file=worker/schema.sql

-- 퍼널 관측: 게임 페이지·API 도달 기록
-- version_id: 이 행을 기록한 서빙 배포 버전(version_metadata 바인딩). 지표 이상↔배포 조인용.
CREATE TABLE IF NOT EXISTS hits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  path TEXT NOT NULL,
  ua TEXT,
  country TEXT,
  ip_hash TEXT,
  version_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_hits_path_ts ON hits (path, ts);

-- 발자국: 정답·오답 제출 모두 기록 (token_hash UNIQUE로 재사용 차단)
CREATE TABLE IF NOT EXISTS footprints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  name TEXT NOT NULL,
  expr TEXT NOT NULL,
  answer TEXT,
  correct INTEGER NOT NULL,
  ua TEXT,
  country TEXT,
  ip_hash TEXT,
  token_hash TEXT UNIQUE,
  version_id TEXT
);

-- ── 기존 원격 DB 마이그레이션 (2026-08-04, 제안 20260804-1300) ──────────────
-- 위 CREATE는 IF NOT EXISTS라 이미 존재하는 원격 테이블엔 컬럼을 더하지 않는다.
-- **새 Worker를 배포하기 전에** 아래 ALTER를 원격 D1에 먼저 적용해야 한다 —
-- version_id 컬럼이 없는 상태로 새 코드가 배포되면 INSERT가 깨진다(footprint 제출이 409로 실패).
-- 컬럼은 nullable이라 구/신 Worker 양쪽과 호환되고, ALTER→deploy 순서만 지키면 안전하다.
-- ALTER는 SQLite에서 IF NOT EXISTS를 못 쓰므로 **한 번만** 실행한다(재실행 시 duplicate column 에러).
--   npx wrangler d1 execute ryuology-footprints --remote \
--     --command "ALTER TABLE hits ADD COLUMN version_id TEXT; ALTER TABLE footprints ADD COLUMN version_id TEXT;"
