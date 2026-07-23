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

export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
