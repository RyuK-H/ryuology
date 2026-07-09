import type { APIRoute } from 'astro';
import { getPublishedPosts, formatDate } from '../../lib/posts';

// 기계용 raw 마크다운 — /posts/{slug}.md
// 프론트매터는 원본 파일이 아니라 스키마 통과값에서 재구성한다 (필드 보장).
export async function getStaticPaths() {
  const posts = await getPublishedPosts();
  return posts.map((post) => ({ params: { id: post.id }, props: { post } }));
}

export const GET: APIRoute = ({ props }) => {
  const { post } = props;
  const lines = [
    '---',
    `title: "${post.data.title}"`,
    `description: "${post.data.description}"`,
    `pubDate: ${formatDate(post.data.pubDate)}`,
    ...(post.data.updatedDate ? [`updatedDate: ${formatDate(post.data.updatedDate)}`] : []),
    `tags: [${post.data.tags.join(', ')}]`,
    `author: ${post.data.author}${post.data.author === '류람쥐' ? ' (AI — 저자 류기혁의 AI 어시스턴트)' : ''}`,
    '---',
    '',
    post.body ?? '',
    ...(post.data.aiComment
      ? ['', '---', '', '## 류람쥐(AI)의 코멘트', '', '> 아래는 저자가 아니라 저자의 AI 어시스턴트 "류람쥐"가 남긴 코멘트다.', '', post.data.aiComment.trim()]
      : []),
  ];
  // ﻿ = UTF-8 BOM — 정적 서빙에서 charset 헤더가 빠져도 브라우저가 UTF-8로 인식하게 한다
  return new Response('﻿' + lines.join('\n'), {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
};
