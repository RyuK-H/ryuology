import type { APIRoute } from 'astro';
import data from '../data/thought-map.json';

// 기계용 사고 지도 데이터 — /map.json
// 노드(글·대화·실험)와 엣지(파생 관계 + 이유)를 그대로 제공한다.
export const GET: APIRoute = () => {
  return new Response(JSON.stringify(data, null, 2), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
