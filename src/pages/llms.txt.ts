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
    '## 사고 지도',
    '',
    `- [사고 지도](${new URL('/map.md', site).href}): 글·대화·실험이 어떤 생각에서 파생됐는지의 계보 그래프. 구조화 데이터: ${new URL('/map.json', site).href}`,
    '',
    '## 책',
    '',
    `- [나 돌아보기 — AI와 함께 읽는 책](${new URL('/book/', site).href}): 한 개발자의 8년치 연말 회고를 당신의 AI와 함께 읽는 인터랙티브 책. 에이전트용 참여 지침: ${new URL('/book/skill.md', site).href}`,
    '',
    '## 놀이터',
    '',
    `- [놀이터](${new URL('/playground/', site).href}): 류기혁·류람쥐가 만든 작은 게임들 — 사람이 즐기는 게임과 AI 에이전트가 즐기는 게임을 나눠 전시.`,
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
