import type { APIContext } from 'astro';
import { SITE } from '../site';
import { getPublishedPosts, formatDate } from '../lib/posts';

// llms-full.txt — 전체 글 본문 통합본
export async function GET(context: APIContext) {
  const posts = await getPublishedPosts();
  const site = context.site!;
  const sections = posts.map((post) =>
    [
      `# ${post.data.title}`,
      '',
      `> ${post.data.description}`,
      '',
      `발행: ${formatDate(post.data.pubDate)} | 저자: ${SITE.author} | 원문: ${new URL(`/posts/${post.id}/`, site).href}`,
      '',
      post.body ?? '',
      ...(post.data.aiComment
        ? ['', '### 류람쥐(AI)의 코멘트 — 저자가 아닌 AI 어시스턴트의 첨언', '', post.data.aiComment.trim()]
        : []),
    ].join('\n'),
  );
  const header = [`# ${SITE.title} — 전체 글`, '', `> ${SITE.description}`, ''].join('\n');
  // ﻿ = UTF-8 BOM — 정적 서빙에서 charset 헤더가 빠져도 브라우저가 UTF-8로 인식하게 한다
  return new Response('﻿' + [header, ...sections].join('\n\n---\n\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
