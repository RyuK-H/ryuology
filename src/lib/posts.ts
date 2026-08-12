import { getCollection, type CollectionEntry } from 'astro:content';

export type Post = CollectionEntry<'posts'>;

// draft 제외 + 최신순. 목록·피드·llms.txt 전부 이 함수만 쓴다.
// 로컬 개발 서버(npm run dev)에서만 draft도 노출 — 발행 전 미리보기용. 배포 빌드에서는 항상 숨김.
export async function getPublishedPosts(): Promise<Post[]> {
  const posts = await getCollection('posts', ({ data }) => import.meta.env.DEV || !data.draft);
  const sorted = posts.sort((a, b) => {
    const diff = b.data.pubDate.valueOf() - a.data.pubDate.valueOf();
    if (diff !== 0) return diff;
    // pubDate가 완전히 같으면 정렬 순서가 파일 순서에 맡겨져 불확정해진다.
    // id로 안정화(가드가 먼저 잡지만, 결정성을 위한 안전망).
    return a.id.localeCompare(b.id);
  });
  // 재발 방지 가드: 같은 pubDate(같은 날인데 시간 미지정) 글이 둘 이상이면 목록·피드 순서가 뒤섞인다.
  // 조용히 오정렬되느니 빌드를 실패시켜 즉시 알린다. 같은 날 두 번째 글부터는 pubDate에 시간을 넣을 것.
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].data.pubDate.valueOf() === sorted[i - 1].data.pubDate.valueOf()) {
      throw new Error(
        `[posts] pubDate가 동일해 정렬 순서가 불확정합니다: "${sorted[i - 1].id}" ↔ "${sorted[i].id}" ` +
          `(${formatDate(sorted[i].data.pubDate)}). 같은 날 두 번째 글부터는 pubDate에 시간을 넣으세요 ` +
          `— 예: pubDate: 2026-07-23T15:00:00+09:00 (Z는 KST에서 날짜가 밀릴 수 있으니 +09:00 권장).`,
      );
    }
  }
  return sorted;
}

// 페이로드 안 상대경로(`](/images/...)`, `](/posts/...)`)를 절대 URL로 조립한다.
//
// 결정 (2026-08-12, 제안 20260812-1250-ryuology-relative-asset-paths-in-payload):
//   2026-08-01에 RSS 본문에 canonical 한 줄을 박은 근거는 「사본과 함께 이동하는 건
//   페이로드 안 문자열뿐」이었다. 그 원칙이 자산 참조에는 적용이 안 돼 있었다 —
//   이미지 51건·내부 링크 10건의 src가 상대경로였고, 피드에는 xml:base가 없으며
//   RSS 2.0은 content 안쪽의 base URI를 규정하지 않는다. 즉 이미지의 alt(우리가 만드는
//   가장 질 좋은 기계 판독용 서술)는 건너가는데 설명 대상이 안 건너갔다.
//
// 대상은 페이로드 3면(rss.xml · llms-full.txt · /posts/{id}.md)뿐이다.
// 우리가 서빙하는 HTML은 상대경로가 맞다 — 도메인이 바뀌어도 따라오고, 사본 문제가 없다.
// 어긋나면 scripts/check-extraction-surfaces.mjs가 빌드를 실패시킨다.
const MD_RELATIVE = /(\]\()(\/[^)\s]*)/g;

// 코드 안의 `](/x)`는 설명용 예시일 수 있으므로 건드리지 않는다 (현재 코퍼스엔 0건이지만,
// 마크다운을 소재로 쓰는 글이 나오면 조용히 오염될 자리라 미리 막는다).
function absolutizeLine(line: string, site: URL): string {
  return line
    .split(/(`+[^`]*`+)/g)
    .map((seg, i) =>
      i % 2 === 1 ? seg : seg.replace(MD_RELATIVE, (_m, open: string, path: string) => open + new URL(path, site).href),
    )
    .join('');
}

export function absolutizePayloadLinks(body: string, site: URL): string {
  let inFence = false;
  return body
    .split('\n')
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) {
        inFence = !inFence;
        return line;
      }
      return inFence ? line : absolutizeLine(line, site);
    })
    .join('\n');
}

// 표시 날짜는 항상 KST(Asia/Seoul) 기준으로 찍는다.
// getFullYear/getMonth/getDate는 빌드 머신의 로컬 타임존을 쓰므로, 로컬(KST) 빌드와
// Workers Builds CI(UTC) 빌드가 같은 글을 하루 다르게 렌더한다 — KST 00:00~09:00 발행 글이 UTC로 전날.
// sv-SE 로케일은 YYYY-MM-DD를 내주고, timeZone 옵션이 빌드 환경과 무관하게 KST로 고정한다.
const dateFmt = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function formatDate(date: Date): string {
  return dateFmt.format(date);
}
