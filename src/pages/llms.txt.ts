import type { APIContext } from 'astro';
import { SITE } from '../site';
import { getPublishedPosts, formatDate } from '../lib/posts';

// llms.txt — AI 에이전트용 사이트 인덱스 (https://llmstxt.org)
export async function GET(context: APIContext) {
  const posts = await getPublishedPosts();
  const site = context.site!;
  const lines = [
    `# ${SITE.title}`,
    '',
    `> ${SITE.description}`,
    '',
    `저자: ${SITE.author}. 모든 글은 HTML과 raw 마크다운(.md) 두 형식으로 제공된다.`,
    `전체 본문 통합본: ${new URL('/llms-full.txt', site).href}`,
    '',
    '## 글',
    '',
    ...posts.map(
      (post) =>
        `- [${post.data.title}](${new URL(`/posts/${post.id}.md`, site).href}): ${post.data.description} (${formatDate(post.data.pubDate)})`,
    ),
    '',
    '## 소개',
    '',
    `- [About](${new URL('/about/', site).href})`,
  ];
  // ﻿ = UTF-8 BOM — 정적 서빙에서 charset 헤더가 빠져도 브라우저가 UTF-8로 인식하게 한다
  return new Response('﻿' + lines.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
