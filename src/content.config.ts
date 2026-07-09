import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const posts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    description: z.string(), // TL;DR 한두 문장 — 목록·메타데이터·피드 요약에 쓰인다
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
    author: z.string().default('류기혁'), // 람쥐보고서 등 AI 기고는 '류람쥐'
    book: z.boolean().default(false), // '나 돌아보기' 챕터 여부 (연말 회고만 true)
    aiComment: z.string().optional(), // 글 하단에 달리는 AI(류람쥐)의 코멘트 — 문단은 빈 줄로 구분

  }),
});

export const collections = { posts };
