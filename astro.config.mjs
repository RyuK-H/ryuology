import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import remarkSmartypants from 'remark-smartypants';

export default defineConfig({
  site: 'https://ryuology.com',
  integrations: [sitemap()],
  // Astro 7은 스마트따옴표 엔진을 retext-smartypants로 바꿨는데, 한글에 붙은
  // 따옴표(예: "…?"라고)의 방향을 오판한다. 내장 것을 끄고 Astro 5까지 쓰던
  // remark-smartypants를 직접 물려 기존 타이포그래피를 그대로 유지한다.
  markdown: {
    smartypants: false,
    remarkPlugins: [remarkSmartypants],
  },
});
