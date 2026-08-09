// 사이트 공통 상수 — 여기만 고치면 전체(레이아웃, RSS, llms.txt, JSON-LD)에 반영된다.
export const SITE = {
  title: 'RyuOlogy',
  tagline: '겪은 것을 학문처럼 기록한다',
  description:
    '블록체인 규제·회계감사·상장 실무, 웹3 조직 리딩 — 해본 사람만 쓸 수 있는 기록. 개발자 류기혁의 개인 블로그.',
  author: '류기혁',
  lang: 'ko',
} as const;

// 저자 공개 프로필 — About의 링크와 Person JSON-LD sameAs(엔티티 통합 신호)에 쓰인다
export const AUTHOR_PROFILES = {
  github: 'https://github.com/RyuK-H',
  x: 'https://x.com/rkh1206',
  linkedin: 'https://www.linkedin.com/in/ryuchain/',
  tistory: 'https://ryublock.tistory.com',
} as const;

// 기계 채널(meta author · JSON-LD · llms-full.txt)에 나가는 저자 표기.
// 한 곳에서 만들어야 채널끼리 갈라지지 않는다 — 2026-08-09 이전에는 JSON-LD만 AI 글을 구분했고
// meta author는 41/41 전부 류기혁이라 AI 글 10편에서 두 필드가 서로를 부정하고 있었다.
export const AI_AUTHOR = '류람쥐';
export const authorLabel = (author: string): string =>
  author === AI_AUTHOR ? `${AI_AUTHOR} (${SITE.author}의 AI 어시스턴트)` : author;

// 저자별 시그니처 이모지 — 화면 표시용 (제목 텍스트·메타데이터에는 넣지 않는다)
export const AUTHOR_EMOJI: Record<string, string> = {
  류기혁: '👨',
  류람쥐: '🐿️',
};
