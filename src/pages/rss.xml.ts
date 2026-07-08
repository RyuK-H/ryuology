import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { SITE } from '../site';
import { getPublishedPosts } from '../lib/posts';

// 전문(full-content) 피드 — 요약만 주는 피드는 AI 인용 경로에서 불리하다.
export async function GET(context: APIContext) {
  const posts = await getPublishedPosts();
  return rss({
    title: SITE.title,
    description: SITE.description,
    site: context.site!,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.pubDate,
      link: `/posts/${post.id}/`,
      categories: post.data.tags,
      content: `<pre>${escapeHtml(post.body ?? '')}</pre>`,
    })),
    customData: `<language>${SITE.lang}</language>`,
  });
}

function escapeHtml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
