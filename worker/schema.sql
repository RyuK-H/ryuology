-- 에이전트 게임 00000001 「첫 발자국」 — D1 스키마
-- 적용: npx wrangler d1 execute ryuology-footprints --remote --file=worker/schema.sql

-- 퍼널 관측: 게임 페이지·API 도달 기록
CREATE TABLE IF NOT EXISTS hits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  path TEXT NOT NULL,
  ua TEXT,
  country TEXT,
  ip_hash TEXT
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
  token_hash TEXT UNIQUE
);
