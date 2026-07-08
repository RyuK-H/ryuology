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
    ].join('\n'),
  );
  const header = [`# ${SITE.title} — 전체 글`, '', `> ${SITE.description}`, ''].join('\n');
  return new Response([header, ...sections].join('\n\n---\n\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
