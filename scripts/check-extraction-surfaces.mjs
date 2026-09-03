// 추출면 3면(HTML·llms-full.txt·rss.xml) 대조 가드 — 빌드 뒤 dist/를 실측한다.
//
// 결정 (2026-08-11, 제안 20260811-1240-blog-extraction-surface-consistency):
//   - AI 코멘트(aiComment)는 HTML과 llms-full.txt에 싣고, RSS에는 싣지 않는다.
//   - RSS 미탑재는 우연(rss.xml.ts가 post.body만 렌더하는 부작용)이 아니라 의도다.
//     RSS는 라벨이 컨테이너에 사는 면이라, 본문에 aiComment를 붙이면 「AI가 썼다」
//     표시 없이 AI 텍스트가 구독자 사본으로 퍼진다. 싣기로 바꾸려면 라벨을
//     페이로드 안에 넣는 작업과 함께 이 가드를 의식적으로 갱신할 것.
//
// 결정 (2026-08-19, 제안 20260819-1525-blog-publishing-surface-membership-guard):
//   위 내용 검사와 별개로 **멤버십 축**을 둔다 — 발행 5면(rss·sitemap·llms.txt·
//   llms-full·/posts/ 목록)이 src의 non-draft 전량을 싣는지 대조한다.
//   누락의 실패 모드는 404가 아니라 「정상 응답의 부분 집합」이라 조용하다:
//   구독자는 안 온 글을 안 온 줄 모르고, 색인은 없는 URL을 안 찾는다. 그리고
//   우리 지표는 RSS 독자를 애초에 못 센다(전문 피드라 pv 0) — 한 편이 빠지면
//   그걸 알려줄 계기가 우리 쪽에 하나도 없다.
//   반복 정의역은 반드시 **src/content/posts**에서 읽는다(dist가 아니라).
//   dist에서 열거하면 렌더가 통째로 빠진 글이 기대 집합에서도 같이 빠져
//   가드가 조용히 통과한다 — 판정자의 분모가 판정 대상 밖에 있어야 한다.
//
// 어긋나면 조용히 다른 문서가 퍼지느니 빌드를 실패시킨다 (posts.ts pubDate 가드와 같은 방식).

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const postsDir = join(root, 'src', 'content', 'posts');
// 이 가드는 정상 상태가 「아무 일도 안 일어남」이라, 질의가 조용히 틀리면 결과가
// 건강과 글자 그대로 똑같이 생긴다. 그래서 음성 대조(일부러 한 편을 뺀 dist 사본)를
// 밟을 수 있게 열어 둔다 — 원본 dist를 깨뜨리지 않고는 실패 경로를 못 밟는다.
const distDir = process.env.EXTRACTION_DIST ?? join(root, 'dist');

const LABEL = '류람쥐(AI)의 코멘트';

// frontmatter에서 draft 여부와 aiComment 블록(| 블록 스칼라)을 최소 파싱한다.
function parseFrontmatter(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return { draft: false, aiComment: null };
  const fm = m[1];
  const draft = /^draft:\s*true\s*$/m.test(fm);
  const lines = fm.split('\n');
  const idx = lines.findIndex((l) => /^aiComment:/.test(l));
  if (idx === -1) return { draft, aiComment: null };
  const head = lines[idx].replace(/^aiComment:\s*/, '');
  if (head && !/^[|>][+-]?$/.test(head)) {
    // 인라인 문자열
    return { draft, aiComment: head.replace(/^['"]|['"]$/g, '') };
  }
  const block = [];
  for (let i = idx + 1; i < lines.length; i++) {
    if (/^\S/.test(lines[i])) break; // 들여쓰기가 끝나면 블록 종료
    block.push(lines[i].replace(/^ {2}/, ''));
  }
  return { draft, aiComment: block.join('\n').trim() || null };
}

// HTML 이스케이프·따옴표 변형과 무관하게 비교할 수 있도록,
// &<>"' 없는 20자 연속 구간을 탐침으로 고른다.
function pickProbe(text) {
  for (const line of text.split('\n')) {
    const m = line.match(/[^&<>"']{20,}/);
    if (m) return m[0].slice(0, 40);
  }
  // 20자 미만의 짧은 코멘트(실측: "화이팅" 한 마디)는 위 규칙에 안 걸린다 —
  // 가장 긴 무이스케이프 구간으로 폴백. 탐침이 짧을수록 RSS 음성 검사에서
  // 본문 우연 일치 위험이 커지지만, 그 경우 가드는 조용히가 아니라 시끄럽게 실패한다.
  let best = '';
  for (const line of text.split('\n')) {
    for (const m of line.matchAll(/[^&<>"']+/g)) {
      const s = m[0].trim();
      if (s.length > best.length) best = s;
    }
  }
  return best.length >= 2 ? best.slice(0, 40) : null;
}

const failures = [];
const withComment = [];
const published = []; // non-draft 전량 — 멤버십 축의 정의역

for (const file of readdirSync(postsDir).filter((f) => f.endsWith('.md'))) {
  const id = file.replace(/\.md$/, '');
  const { draft, aiComment } = parseFrontmatter(readFileSync(join(postsDir, file), 'utf8'));
  if (draft) continue;
  published.push(id);
  if (!aiComment) continue;
  const probe = pickProbe(aiComment);
  if (!probe) {
    failures.push(`[${id}] aiComment에서 탐침 구간을 못 골랐습니다 — 가드 로직을 점검하세요`);
    continue;
  }
  withComment.push({ id, probe });
}

const rss = readFileSync(join(distDir, 'rss.xml'), 'utf8');
const llmsFull = readFileSync(join(distDir, 'llms-full.txt'), 'utf8');
const rssItems = rss.split('<item>').slice(1);

// ─────────────────────────────────────────────────────────────────────────────
// 멤버십 축 — 발행 5면이 non-draft 전량을 싣는가 (2026-08-19, 제안 20260819-1525)
// ─────────────────────────────────────────────────────────────────────────────

const expected = new Set(published);

// 기대 개수를 하드코딩하지 않는다 — 전부 src에서 도출한 `expected`와 대조한다.
// 그래야 글을 더할 때 가드를 손대지 않아도 되고, 「가드가 낡아서 통과」가 안 생긴다.
function assertMembership(surface, actualIds) {
  const actual = new Set(actualIds);
  const missing = published.filter((id) => !actual.has(id));
  const extra = [...actual].filter((id) => !expected.has(id));
  const fmt = (ids) => ids.slice(0, 8).join(', ') + (ids.length > 8 ? ` … (총 ${ids.length}편)` : '');
  if (missing.length > 0) {
    failures.push(
      `[${surface}] non-draft ${published.length}편 중 ${missing.length}편이 빠졌습니다: ${fmt(missing)} ` +
        `— 이 누락은 404가 아니라 정상 응답의 부분 집합이라 배포 후엔 아무 신호도 안 냅니다`,
    );
  }
  if (extra.length > 0) {
    failures.push(
      `[${surface}] src에 없는 글이 실렸습니다: ${fmt(extra)} ` +
        `— draft가 새어나갔거나 dist에 지난 빌드 잔재가 남았는지 확인하세요`,
    );
  }
  return missing.length === 0 && extra.length === 0;
}

// 1) rss.xml — <item>의 <link>. 도메인은 안 박는다(site가 바뀌어도 축은 그대로).
const rssIds = rssItems.flatMap((it) => [...it.matchAll(/<link>[^<]*\/posts\/([^<\/]+)\/<\/link>/g)].map((m) => m[1]));
assertMembership('rss.xml', rssIds);
if (rssIds.length !== new Set(rssIds).size) {
  failures.push(`[rss.xml] <item>에 중복 링크가 있습니다 (${rssIds.length}건 중 고유 ${new Set(rssIds).size}건)`);
}

// 2) sitemap — 파일명을 고정하지 않고 sitemap-index.xml이 가리키는 조각 전부를 합친다
//    (URL이 45,000을 넘으면 @astrojs/sitemap이 sitemap-1.xml로 쪼개는데, 그때
//     sitemap-0.xml만 읽는 가드는 조용히 반쪽만 검사하게 된다 — 오늘 아침 아카이버와 같은 결함).
const sitemapIndex = readFileSync(join(distDir, 'sitemap-index.xml'), 'utf8');
const sitemapParts = [...sitemapIndex.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].split('/').pop());
if (sitemapParts.length === 0) {
  failures.push('[sitemap] sitemap-index.xml이 조각을 하나도 가리키지 않습니다 — 열거 자체가 비었습니다');
}
const sitemapLocs = [];
for (const f of sitemapParts) {
  if (!existsSync(join(distDir, f))) {
    failures.push(`[sitemap] ${f}이(가) dist에 없습니다 — 인덱스가 없는 조각을 가리킵니다`);
    continue;
  }
  const part = readFileSync(join(distDir, f), 'utf8');
  for (const m of part.matchAll(/<loc>([^<]+)<\/loc>/g)) sitemapLocs.push(new URL(m[1]).pathname);
}
assertMembership(
  'sitemap',
  sitemapLocs.map((p) => p.match(/^\/posts\/([^/]+)\/$/)?.[1]).filter(Boolean),
);
// 목록 페이지(/posts/) 자신은 결함이 아니라 정상 — 없으면 그게 결함이다.
if (!sitemapLocs.includes('/posts/')) {
  failures.push('[sitemap] 목록 페이지 /posts/ 가 sitemap에 없습니다');
}

// 3) llms.txt — 「## 글」 목록의 페이로드 링크(/posts/{id}.md)
const llms = readFileSync(join(distDir, 'llms.txt'), 'utf8');
assertMembership('llms.txt', [...llms.matchAll(/\/posts\/([^()\s/]+)\.md/g)].map((m) => m[1]));

// 4) llms-full.txt — 섹션당 정확히 하나인 「발행: … | 원문: …」 라인
assertMembership(
  'llms-full.txt',
  [...llmsFull.matchAll(/^발행: .*\| 원문: \S*\/posts\/([^\s/]+)\/$/gm)].map((m) => m[1]),
);

// 5) /posts/ 목록 페이지 — 렌더된 링크
const postsIndexPath = join(distDir, 'posts', 'index.html');
if (!existsSync(postsIndexPath)) {
  failures.push('[/posts/] 목록 페이지가 렌더되지 않았습니다');
} else {
  const postsIndex = readFileSync(postsIndexPath, 'utf8');
  assertMembership(
    '/posts/ 목록',
    [...postsIndex.matchAll(/href="\/posts\/([^"/]+)\/"/g)].map((m) => m[1]),
  );
}

// 6) 실물 — 위 다섯 면이 가리키는 대상이 실제로 존재하는가.
//    멤버십만 재면 「목록엔 있는데 열면 404」를 못 잡는다. rss·sitemap·llms.txt는
//    전부 콘텐츠 컬렉션에서 파생되므로, 렌더가 빠져도 목록에는 멀쩡히 남는다.
const missingArtifacts = published.flatMap((id) =>
  [`posts/${id}/index.html`, `posts/${id}.md`].filter((rel) => !existsSync(join(distDir, rel))),
);
if (missingArtifacts.length > 0) {
  failures.push(
    `[dist] 목록엔 실렸는데 실물이 없는 산출물 ${missingArtifacts.length}건: ` +
      missingArtifacts.slice(0, 8).join(', ') +
      (missingArtifacts.length > 8 ? ' …' : ''),
  );
}

// 탐침이 다른 글의 제목·본문과 우연히 겹칠 수 있으므로(실측: moat 글 코멘트가
// riding-the-current 제목을 인용) 면 전체가 아니라 그 글의 구간 안에서만 비교한다.
function rssItemOf(id) {
  return rssItems.find((it) => it.includes(`/posts/${id}/</link>`)) ?? null;
}

// llms-full은 섹션 구분자(`---`)가 본문 수평선과 겹쳐 split이 안전하지 않다.
// 대신 각 섹션에 정확히 하나 있는 「발행: … | 원문: …」 라인의 위치로 구간을 잡는다
// (본문 속 내부 링크에는 안 걸린다).
const ORIGIN_LINE = /^발행: .*\| 원문: \S+$/gm;
const LLMS_HEADING = '### 류람쥐(AI)의 코멘트';
function llmsSectionOf(id) {
  const own = new RegExp(`^발행: .*\\| 원문: \\S*/posts/${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/$`, 'm');
  const m = own.exec(llmsFull);
  if (!m) return null;
  ORIGIN_LINE.lastIndex = m.index + m[0].length;
  const next = ORIGIN_LINE.exec(llmsFull);
  return llmsFull.slice(m.index, next ? next.index : llmsFull.length);
}

for (const { id, probe } of withComment) {
  const htmlPath = join(distDir, 'posts', id, 'index.html');
  if (!existsSync(htmlPath)) {
    failures.push(`[${id}] dist/posts/${id}/index.html이 없습니다`);
    continue;
  }
  const html = readFileSync(htmlPath, 'utf8');
  if (!html.includes(probe) || !html.includes(LABEL)) {
    failures.push(`[${id}] HTML에 aiComment 또는 라벨이 없습니다 — 실어야 하는 면입니다`);
  }
  // 탐침은 코멘트 헤딩 뒤에서만 인정한다 — 구간 꼬리에 딸려온 다음 섹션 헤더와의 충돌 방지.
  const section = llmsSectionOf(id);
  const headingAt = section ? section.indexOf(LLMS_HEADING) : -1;
  if (headingAt === -1 || !section.slice(headingAt).includes(probe)) {
    failures.push(`[${id}] llms-full.txt의 이 글 섹션에 aiComment가 없습니다 — 실어야 하는 면입니다`);
  }
  const item = rssItemOf(id);
  if (!item) {
    failures.push(`[${id}] rss.xml에 이 글의 <item>이 없습니다`);
  } else if (item.includes(probe)) {
    failures.push(
      `[${id}] rss.xml의 이 글 <item>에 aiComment 본문이 실렸습니다 — 결정(20260811-1240)은 RSS 미탑재입니다. ` +
        `싣기로 바꾸려면 라벨을 페이로드 안에 넣고 이 가드를 갱신하세요`,
    );
  }
}

if (rss.includes(LABEL)) {
  failures.push(`rss.xml에 「${LABEL}」 라벨이 실렸습니다 — 결정(20260811-1240)은 RSS 미탑재입니다`);
}

// 페이로드 3면의 상대경로 0건 검사 (2026-08-12, 제안 20260812-1250).
// 사본과 함께 이동하는 건 페이로드 안 문자열뿐 — 이미지 src와 내부 링크가 상대경로면
// 설명(alt)은 건너가는데 설명 대상이 안 건너간다. HTML은 검사 대상이 아니다(상대경로가 맞다).
const payloadSurfaces = [
  ['rss.xml', rss],
  ['llms-full.txt', llmsFull],
  ...readdirSync(join(distDir, 'posts'))
    .filter((f) => f.endsWith('.md'))
    .map((f) => [`posts/${f}`, readFileSync(join(distDir, 'posts', f), 'utf8')]),
];
for (const [name, text] of payloadSurfaces) {
  const rel = [...text.matchAll(/\]\((\/[^)\s]*)/g)].map((m) => m[1]);
  if (rel.length > 0) {
    const shown = [...new Set(rel)].slice(0, 5).join(', ');
    failures.push(
      `[${name}] 페이로드에 상대경로 ${rel.length}건이 남았습니다 (${shown}${rel.length > 5 ? ' …' : ''}) ` +
        `— src/lib/posts.ts의 absolutizePayloadLinks를 거치는지 확인하세요`,
    );
  }
}

if (failures.length > 0) {
  console.error('✖ 추출면 대조 실패:\n' + failures.map((f) => `  - ${f}`).join('\n'));
  process.exit(1);
}
console.log(
  `✔ 추출면 대조 통과 — 멤버십 non-draft ${published.length}편 × 5면(rss·sitemap·llms.txt·llms-full·/posts/) ✓ ` +
    `+ 실물 ${published.length * 2}건 ✓ | aiComment ${withComment.length}편: HTML ✓ / llms-full ✓ / RSS 미탑재 ✓ | ` +
    `페이로드 상대경로 0건 (${payloadSurfaces.length}면) ✓`,
);
