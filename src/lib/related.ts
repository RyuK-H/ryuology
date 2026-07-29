import thoughtMapData from '../data/thought-map.json';
import { getPublishedPosts, type Post } from './posts';

// 글 하단 '다음 읽을 글' — 추천 엔진을 새로 만들지 않는다.
// 사고 지도(thought-map.json)의 계보 엣지를 그대로 읽어 쓴다. 유사도 계산 없음.
// 엣지마다 붙어 있는 why 문장이 곧 '왜 이 글로 이어지는가'의 설명이다.

interface MapNode {
  id: string;
  type: string;
  title: string;
  url?: string;
}
interface MapEdge {
  s: string;
  t: string;
  why: string;
}
const thoughtMap = thoughtMapData as { nodes: MapNode[]; edges: MapEdge[] };

export type RelatedKind = 'child' | 'parent' | 'retro-next' | 'retro-prev' | 'retro-root-child';

const KICKER: Record<RelatedKind, string> = {
  child: '여기로 이어집니다',
  parent: '이 글은 여기서 이어졌습니다',
  'retro-next': '다음 회고',
  'retro-prev': '이전 회고',
  'retro-root-child': '회고에서 이어진 글',
};

export interface RelatedLink {
  kind: RelatedKind;
  kicker: string;
  href: string;
  title: string;
  why?: string;
}

// 카드는 최대 2장. 빈 칸을 유사도 같은 걸로 억지로 채우지 않는다 —
// '왜 이어지는지 말할 수 있다'가 이 기능의 유일한 차별점이라, 말할 수 없는 연결은 넣지 않는다.
const MAX_LINKS = 2;
const RETRO_TAG = '회고';
const RETRO_ROOT_NODE = 'retro';
// 저자가 "이어진 곳이 없다"고 판단한 단독 글 — 계보 누락 경고에서 제외 (억지 연결 금지 원칙).
// losing-bets: 2026-07-29 기혁님 확정.
const STANDALONE_NODES = new Set(['losing-bets']);

let cache: Map<string, RelatedLink[]> | null = null;

function postIdFromUrl(url: string | undefined): string | null {
  const m = url?.match(/\/posts\/([^/]+)\/?$/);
  return m ? m[1] : null;
}

async function build(): Promise<Map<string, RelatedLink[]>> {
  const posts = await getPublishedPosts(); // 최신순
  const postById = new Map(posts.map((p) => [p.id, p]));
  const problems: string[] = [];

  // 노드 ↔ 글 매핑 (노드의 url에서 글 id를 뽑는다)
  const nodeToPost = new Map<string, string>();
  const postToNode = new Map<string, string>();
  for (const node of thoughtMap.nodes) {
    const pid = postIdFromUrl(node.url);
    if (!pid) continue; // 글이 아닌 노드(실험·사건·뿌리) 또는 /book/ 링크
    if (!postById.has(pid)) {
      problems.push(`노드 "${node.id}"의 url이 가리키는 글을 찾을 수 없습니다: ${node.url}`);
      continue;
    }
    nodeToPost.set(node.id, pid);
    postToNode.set(pid, node.id);
  }

  // 엣지 인덱스 — thought-map.json의 배열 순서를 그대로 보존한다.
  // 그 순서가 곧 저자의 큐레이션 순서이고, 순서를 바꾸고 싶으면 JSON에서 엣지 줄만 옮기면 된다.
  const childEdges = new Map<string, MapEdge[]>();
  const parentEdges = new Map<string, MapEdge[]>();
  for (const edge of thoughtMap.edges) {
    if (!childEdges.has(edge.s)) childEdges.set(edge.s, []);
    childEdges.get(edge.s)!.push(edge);
    if (!parentEdges.has(edge.t)) parentEdges.set(edge.t, []);
    parentEdges.get(edge.t)!.push(edge);
  }

  const toLink = (nodeId: string, kind: RelatedKind, why?: string): RelatedLink | null => {
    const pid = nodeToPost.get(nodeId);
    if (!pid) return null; // 글이 없는 노드(실험·사건)는 추천하지 않는다
    const post = postById.get(pid)!;
    return {
      kind,
      kicker: KICKER[kind],
      href: `/posts/${pid}/`,
      title: post.data.title,
      why,
    };
  };

  // 회고 폴백용 재료 — 회고 11편은 지도에서 뿌리 노드 하나로 압축돼 있어 개별 노드가 없다.
  const retroPosts = posts.filter((p) => p.data.tags.includes(RETRO_TAG)); // 최신순
  const retroRootChild = (childEdges.get(RETRO_ROOT_NODE) ?? [])
    .map((e) => ({ edge: e, pid: nodeToPost.get(e.t) }))
    .filter((x): x is { edge: MapEdge; pid: string } => Boolean(x.pid))
    .sort((a, b) => postById.get(b.pid)!.data.pubDate.valueOf() - postById.get(a.pid)!.data.pubDate.valueOf())[0];

  const result = new Map<string, RelatedLink[]>();

  for (const post of posts) {
    const links: RelatedLink[] = [];
    const nodeId = postToNode.get(post.id);

    if (nodeId) {
      // T1 — 자식 엣지 (계보가 앞으로 흐르는 방향)
      for (const edge of childEdges.get(nodeId) ?? []) {
        if (links.length >= MAX_LINKS) break;
        const link = toLink(edge.t, 'child', edge.why);
        if (link) links.push(link);
      }
      // T2 — 자식으로 못 채웠으면 부모 엣지 (최신 글은 언제나 잎이라 이 경로를 탄다)
      const parents = parentEdges.get(nodeId) ?? [];
      for (const edge of parents) {
        if (links.length >= MAX_LINKS) break;
        const link = toLink(edge.s, 'parent', edge.why);
        if (link) links.push(link);
      }
      if (parents.length === 0 && !STANDALONE_NODES.has(nodeId)) {
        problems.push(
          `"${post.id}" (노드 ${nodeId}): 부모 엣지가 없습니다 — 사고 지도에 계보가 안 붙어 있습니다.`,
        );
      }
    } else if (post.data.tags.includes(RETRO_TAG)) {
      // T3 — 회고 전용. 연도순 이웃 한 편 + 회고 뿌리에서 파생된 최신 글 한 편.
      const i = retroPosts.findIndex((p) => p.id === post.id);
      const newer = i > 0 ? retroPosts[i - 1] : null;
      const older = i >= 0 && i < retroPosts.length - 1 ? retroPosts[i + 1] : null;
      const neighbor = newer ?? older;
      if (neighbor) {
        links.push({
          kind: newer ? 'retro-next' : 'retro-prev',
          kicker: KICKER[newer ? 'retro-next' : 'retro-prev'],
          href: `/posts/${neighbor.id}/`,
          title: neighbor.data.title,
        });
      }
      if (retroRootChild && links.length < MAX_LINKS) {
        const link = toLink(retroRootChild.edge.t, 'retro-root-child', retroRootChild.edge.why);
        if (link) links.push(link);
      }
    } else {
      problems.push(`"${post.id}": 사고 지도에 노드가 없습니다 — 발행했으면 지도에도 올려야 합니다.`);
    }

    if (links.length === 0 && !(nodeId && STANDALONE_NODES.has(nodeId))) {
      problems.push(`"${post.id}": 다음 읽을 글이 한 편도 안 잡힙니다.`);
    }
    result.set(post.id, links);
  }

  // 재발 방지 가드. 지금은 경고까지만 — 지도에 계보가 안 붙은 노드가 남아 있어서다.
  // 지도가 깨끗해지면 이 블록을 throw로 바꾼다 (posts.ts의 pubDate 가드와 같은 방식).
  if (problems.length > 0) {
    console.warn(
      `\n[related] 사고 지도와 발행 글이 어긋납니다 (${problems.length}건):\n` +
        problems.map((p) => `  · ${p}`).join('\n') +
        `\n  ↳ ${RETRO_TAG} 태그 글은 뿌리 노드로 압축돼 있어 노드 없음이 정상입니다.\n`,
    );
  }

  return result;
}

export async function getRelatedLinks(postId: string): Promise<RelatedLink[]> {
  if (!cache) cache = await build();
  return cache.get(postId) ?? [];
}

export type { Post };
