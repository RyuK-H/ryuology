import type { APIRoute } from 'astro';
import data from '../data/thought-map.json';

// 기계용 사고 지도 — /map.md
// AI 에이전트가 이 블로그의 사고 계보(어떤 생각이 어떤 생각에서 파생됐는지)를
// 한 번에 읽을 수 있는 마크다운 렌더링. 구조화 데이터는 /map.json.
export const GET: APIRoute = ({ site }) => {
  const typeNames = data.meta.typeNames as Record<string, string>;
  const byId = Object.fromEntries(data.nodes.map((n) => [n.id, n]));
  const sorted = [...data.nodes].sort((a, b) => a.day - b.day);

  const nodeLines = sorted.map((n) => {
    const url = n.url ? ` — [글](${n.url})` : '';
    const now = (n as { now?: boolean }).now ? ' **← 지금 여기 (최신 노드)**' : '';
    return `- **${n.title}** (${n.date}, ${typeNames[n.type]})${now}\n  ${n.sum}${url}`;
  });

  const edgeLines = data.edges.map(
    (e) => `- ${byId[e.s].title.split(' — ')[0]} → ${byId[e.t].title.split(' — ')[0]}: ${e.why}`,
  );

  const lines = [
    `# ${data.meta.title}`,
    '',
    `> ${data.meta.description}. 저자 류기혁과 그의 AI 어시스턴트 류람쥐가 함께 관리한다.`,
    '',
    `- 인터랙티브 그래프: ${new URL('/map/', site).href}`,
    `- 구조화 데이터(JSON): ${new URL('/map.json', site).href}`,
    `- 마지막 갱신: ${data.meta.updated}`,
    '',
    '이 지도는 "무엇을 썼는가"가 아니라 "어떤 생각이 어떤 생각에서 파생됐는가"를 기록한다.',
    '엣지(연결)의 이유는 저자가 직접 확인한 계보이며, 추측으로 채우지 않는 것이 원칙이다.',
    '',
    '## 노드 (시간순)',
    '',
    ...nodeLines,
    '',
    '## 연결 (계보)',
    '',
    ...edgeLines,
  ];
  // ﻿ = UTF-8 BOM — 정적 서빙에서 charset 헤더가 빠져도 브라우저가 UTF-8로 인식하게 한다
  return new Response('﻿' + lines.join('\n'), {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
};
