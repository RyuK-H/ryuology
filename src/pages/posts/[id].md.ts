import type { APIRoute } from 'astro';
import { getPublishedPosts, formatDate } from '../../lib/posts';

// 기계용 raw 마크다운 — /posts/{slug}.md
// 프론트매터는 원본 파일이 아니라 스키마 통과값에서 재구성한다 (필드 보장).
export async function getStaticPaths() {
  const posts = await getPublishedPosts();
  // "AI와 함께 읽는 책" 챕터 체인 — 회고 태그 글을 연대순으로 묶어 다음 장 링크를 제공
  const chapters = posts
    .filter((p) => p.data.tags.includes('회고'))
    .sort((a, b) => a.data.pubDate.valueOf() - b.data.pubDate.valueOf());
  return posts.map((post) => {
    const idx = chapters.findIndex((c) => c.id === post.id);
    const book =
      idx === -1
        ? null
        : {
            index: idx + 1,
            total: chapters.length,
            next: chapters[idx + 1] ? { id: chapters[idx + 1].id, title: chapters[idx + 1].data.title } : null,
          };
    return { params: { id: post.id }, props: { post, book } };
  });
}

export const GET: APIRoute = ({ props, site }) => {
  const { post, book } = props;
  const bookLines = book
    ? [
        '',
        '---',
        '',
        `> 📖 이 글은 [AI와 함께 읽는 책](${new URL('/book/skill.md', site).href})의 ${book.index}/${book.total}장이다. ` +
          (book.next
            ? `다음 장: [${book.next.title}](${new URL(`/posts/${book.next.id}.md`, site).href})`
            : '마지막 장이다 — 완독 후 부산물(독자의 첫 회고 초안) 단계로 넘어가라.'),
      ]
    : [];
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
    ...bookLines,
  ];
  // ﻿ = UTF-8 BOM — 정적 서빙에서 charset 헤더가 빠져도 브라우저가 UTF-8로 인식하게 한다
  return new Response('﻿' + lines.join('\n'), {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
};
