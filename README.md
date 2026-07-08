# Ryuology

AI-First 개인 블로그 (https://ryuology.com). Astro 정적 사이트 — 사람용 HTML과 기계용 raw 마크다운을 함께 발행한다.

## 글 쓰는 법

`src/content/posts/`에 `.md` 파일을 추가하면 끝. 파일명이 URL slug가 된다 (발행 후 변경 금지).

```markdown
---
title: "제목"
description: "TL;DR 한두 문장 — 목록·메타데이터·피드 요약에 쓰인다"
pubDate: 2026-07-08
tags: [tag1, tag2]
draft: false   # true면 어디에도 노출 안 됨
---

본문
```

## 이미지·다이어그램 컨벤션

- **다이어그램은 이미지 금지 — 텍스트 기반으로.** 우선순위: 표 > ASCII 다이어그램 > mermaid 코드 블록. 그림 파일은 AI가 못 읽는다.
- 스크린샷 등 진짜 이미지가 필요할 때만: `public/images/{slug}/`에 두고 절대 경로로 참조 — `![설명](/images/{slug}/파일명.png)`. 상대 경로(`./파일명.png`)는 raw `.md` 주소로 읽어갈 때 깨지므로 금지.
- 이미지에는 alt 텍스트를 반드시 채운다 (기계용 주소에서는 alt가 이미지의 전부).

## 명령어

```
npm install      # 최초 1회
npm run dev      # 로컬 미리보기 (http://localhost:4321)
npm run build    # 정적 빌드 (dist/)
```

## 발행되는 기계용 주소

| 주소 | 내용 |
|------|------|
| `/posts/{slug}.md` | 각 글의 raw 마크다운 |
| `/llms.txt` | 전체 글 인덱스 (llmstxt.org 표준) |
| `/llms-full.txt` | 전체 본문 통합본 |
| `/rss.xml` | 전문(full-content) 피드 |
| `/sitemap-index.xml` | 사이트맵 (자동 생성) |
| `/robots.txt` | AI 크롤러 명시 허용 |

## 배포

Cloudflare Pages에 GitHub 레포 연결 → push하면 자동 배포.

- Build command: `npm run build`
- Output directory: `dist`

사이트 제목·태그라인·소개·저자는 `src/site.ts`에서 관리.
