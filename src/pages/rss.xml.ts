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
    items: posts.map((post) => {
      // 사본과 함께 이동하는 유일한 귀속 — content 페이로드 안에 출처 한 줄.
      // link/canonical은 우리가 서빙하는 페이지에만 붙어 사본을 못 따라간다.
      const canonicalUrl = new URL(`posts/${post.id}/`, context.site).href;
      return {
        title: post.data.title,
        description: post.data.description,
        pubDate: post.data.pubDate,
        link: `/posts/${post.id}/`,
        categories: post.data.tags,
        content: `<pre>${escapeHtml(post.body ?? '')}</pre>\n<p>이 글은 <a href="${canonicalUrl}">${canonicalUrl}</a> 에 처음 실렸습니다.</p>`,
      };
    }),
    customData: `<language>${SITE.lang}</language>`,
  });
}

function escapeHtml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
