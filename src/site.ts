// 사이트 공통 상수 — 여기만 고치면 전체(레이아웃, RSS, llms.txt, JSON-LD)에 반영된다.
export const SITE = {
  title: 'RyuOlogy',
  tagline: '겪은 것을 학문처럼 기록한다',
  description:
    '블록체인 규제·회계감사·상장 실무, 웹3 조직 리딩, 조직 단위 AI 전환 — 해본 사람만 쓸 수 있는 기록. 류기혁의 블로그.',
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

// 저자별 시그니처 이모지 — 화면 표시용 (제목 텍스트·메타데이터에는 넣지 않는다)
export const AUTHOR_EMOJI: Record<string, string> = {
  류기혁: '👨',
  류람쥐: '🐿️',
};
