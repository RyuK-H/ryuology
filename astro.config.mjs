import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import remarkSmartypants from 'remark-smartypants';
import { readFileSync, readdirSync } from 'node:fs';

// sitemap lastmod는 콘텐츠의 updatedDate에서만 온다 — 빌드 시각을 넣으면
// 매 배포마다 전 페이지가 '수정됨'이 되어 신호가 죽는다.
const postsDir = new URL('./src/content/posts/', import.meta.url);
const lastmodByPath = {};
for (const f of readdirSync(postsDir)) {
  if (!f.endsWith('.md')) continue;
  const m = readFileSync(new URL(f, postsDir), 'utf8').match(/^updatedDate:\s*['"]?([0-9][0-9T:+.Z-]*)/m);
  if (m) lastmodByPath[`/posts/${f.replace(/\.md$/, '')}/`] = new Date(m[1]).toISOString();
}

export default defineConfig({
  site: 'https://ryuology.com',
  integrations: [
    sitemap({
      serialize(item) {
        const lastmod = lastmodByPath[new URL(item.url).pathname];
        if (lastmod) item.lastmod = lastmod;
        return item;
      },
    }),
  ],
  // Astro 7은 스마트따옴표 엔진을 retext-smartypants로 바꿨는데, 한글에 붙은
  // 따옴표(예: "…?"라고)의 방향을 오판한다. 내장 것을 끄고 Astro 5까지 쓰던
  // remark-smartypants를 직접 물려 기존 타이포그래피를 그대로 유지한다.
  markdown: {
    smartypants: false,
    remarkPlugins: [remarkSmartypants],
  },
});
