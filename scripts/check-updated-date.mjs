// updatedDate 개정 신호 가드 — 커밋을 분류해서 잰다 (제안 20260816-0925).
//
// 술어가 요점이다: 「마지막 커밋일」은 「마지막 개정일」의 프록시가 아니다.
// 소급 배치 44f5953(frontmatter 전용)이 정확히 그 프록시를 깨서, 순진한 게이트는
// 오늘 맞는 11편에 위양성 11/11을 낸다 (2026-08-16 실측 — 몰트북 067d4f7b 오판 → 5415f4f2 정정).
// 그래서 각 포스트의 커밋을 「본문 변경 / frontmatter·툴링 전용」으로 분류하고,
//   ⓐ 최신 *본문* 커밋이 발행일보다 늦은데 updatedDate가 없거나 그보다 이르면 실패
//   ⓑ 발행 당일 편집은 개정으로 세지 않는다 (ryuology-write 규칙과 동일)
// 워킹트리의 미커밋 본문 변경도 「오늘 날짜의 본문 개정」으로 센다 —
// 발행 플로우가 커밋 전에 빌드하므로, 여기서 안 세면 정확히 그 창을 놓친다.
//
// 실패는 throw(빌드 중단)다. warn 게이트는 눕는다 — related-links 가드의 warn→throw
// 승격이 3주째 열려 있는 자리를 반복하지 않는다. 오늘 기준 위반 0편이라 초기 비용 없음.
//
// ⚠️ git 이력이 없는 환경(CF Pages 빌드 등 얕은/무git 클론)에서는 측정 불가를
// 시끄럽게 알리고 통과한다 — 강제 지점은 로컬 빌드다. 조용한 스킵이 아니라 ⚠️ 한 줄을 남긴다.

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const postsDir = join(root, 'src', 'content', 'posts');

function git(...args) {
  // stderr는 pipe로 삼킨다 — 생성 커밋 판별이 부모 리비전 부재(fatal:)를 정상 경로로 쓴다
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

// git 이력 가용성 — 없으면 측정 불가(시끄러운 통과), 얕으면 분류가 전 커밋을 발행으로 오인한다.
let gitOk = false;
try {
  gitOk = git('rev-parse', '--is-shallow-repository').trim() === 'false';
} catch {
  gitOk = false;
}
if (!gitOk) {
  console.warn(
    '⚠ updatedDate 가드: git 전체 이력이 없어 커밋 분류가 불가합니다 — 검사를 건너뜁니다. ' +
      '이 가드의 강제 지점은 로컬 빌드입니다.',
  );
  process.exit(0);
}

function parseDates(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---/);
  const fm = m ? m[1] : '';
  const pub = fm.match(/^pubDate:\s*['"]?(\d{4}-\d{2}-\d{2})/m);
  const upd = fm.match(/^updatedDate:\s*['"]?(\d{4}-\d{2}-\d{2})/m);
  const draft = /^draft:\s*true\s*$/m.test(fm);
  return { pubDate: pub?.[1] ?? null, updatedDate: upd?.[1] ?? null, draft };
}

function bodyOf(raw) {
  return raw.replace(/^---\n[\s\S]*?\n---\n?/, '').trim();
}

function showOrNull(rev, path) {
  try {
    return git('show', `${rev}:${path}`);
  } catch {
    return null; // 그 리비전에 파일이 없음 (생성 커밋의 부모 등)
  }
}

// 최신 「본문 변경」 커밋의 날짜(커밋 자신의 타임존 기준 YYYY-MM-DD)를 찾는다.
// 신→구로 훑다가 첫 본문 변경에서 멈춘다. 파일 생성 커밋은 발행이므로 본문 변경이다.
function latestBodyChangeDate(relPath) {
  const log = git('log', '--format=%H %ad', '--date=format:%Y-%m-%d', '--', relPath).trim();
  if (!log) return null; // 미추적 신규 파일 — 아직 발행 전
  for (const line of log.split('\n')) {
    const [sha, date] = line.split(' ');
    const after = showOrNull(sha, relPath);
    if (after === null) continue; // 이 커밋에서 삭제된 경로 (개명 등) — 건너뜀
    const before = showOrNull(`${sha}^`, relPath);
    if (before === null) return date; // 생성 커밋 = 발행
    if (bodyOf(before) !== bodyOf(after)) return date;
  }
  return null; // 이력 전체가 frontmatter 전용 — 본문 개정 없음
}

const today = new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD, 로컬
const failures = [];
let revised = 0;
let checked = 0;

for (const file of readdirSync(postsDir).filter((f) => f.endsWith('.md'))) {
  const abs = join(postsDir, file);
  const relPath = relative(root, abs);
  const raw = readFileSync(abs, 'utf8');
  const { pubDate, updatedDate, draft } = parseDates(raw);
  if (draft) continue;
  if (!pubDate) continue; // pubDate 부재는 posts.ts 쪽 가드의 영역
  checked++;

  let lastBody = latestBodyChangeDate(relPath);

  // 워킹트리 미커밋 본문 변경 = 오늘 날짜의 개정 (커밋 전 빌드 창을 닫는다)
  const headRaw = showOrNull('HEAD', relPath);
  if (headRaw !== null && bodyOf(headRaw) !== bodyOf(raw)) {
    if (!lastBody || today > lastBody) lastBody = today;
  }

  if (!lastBody || lastBody <= pubDate) continue; // 개정 없음 또는 발행 당일 편집
  revised++;

  if (!updatedDate) {
    failures.push(
      `[${file}] 발행(${pubDate}) 이후 본문 개정(${lastBody})이 있는데 updatedDate가 없습니다`,
    );
  } else if (updatedDate < lastBody) {
    failures.push(
      `[${file}] updatedDate(${updatedDate})가 최신 본문 개정(${lastBody})보다 이릅니다`,
    );
  }
}

if (failures.length > 0) {
  console.error(
    '✖ updatedDate 가드 실패 — 본문을 고쳤으면 updatedDate를 함께 갱신하세요:\n' +
      failures.map((f) => `  - ${f}`).join('\n'),
  );
  process.exit(1);
}
console.log(`✔ updatedDate 가드 통과 — ${checked}편 검사, 발행 후 본문 개정 ${revised}편 전부 기록됨`);
