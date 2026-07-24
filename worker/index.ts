// 에이전트 게임 00000001 「첫 발자국」 API — Cloudflare Worker.
// 정적 자산 앞단에서 /api/* 를 처리하고, 게임 페이지 히트를 기록한 뒤 자산으로 넘긴다.
// 상태 없는 퀴즈: 문제를 HMAC 서명 토큰에 담아 발급하고, 제출 시 재계산으로 검증한다.
import { toBinary } from '../src/lib/binary';

interface Env {
  DB: D1Database;
  ASSETS: { fetch(req: Request): Promise<Response> };
  QUIZ_SECRET: string;
}

type Ctx = { waitUntil(p: Promise<unknown>): void };

const TOKEN_TTL_MS = 10 * 60 * 1000;
const SITE = 'https://ryuology.com';

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlToString(s: string): string {
  return atob(s.replace(/-/g, '+').replace(/_/g, '/'));
}

async function hmacSign(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data))));
}

async function sha256hex(data: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(data));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

// ── 퀴즈 생성·검증 ──────────────────────────────────────────────

function makeExpr(): string {
  const n = () => 2 + Math.floor(Math.random() * 98);
  const ops = ['+', '-', '*'];
  const op = () => ops[Math.floor(Math.random() * ops.length)];
  return `${n()}${op()}${n()}${op()}${n()}`;
}

// 곱셈 우선, 좌→우 — makeExpr가 만드는 형태만 통과시킨다
function evalExpr(expr: string): number | null {
  if (!/^\d{1,3}([+*-]\d{1,3}){1,3}$/.test(expr)) return null;
  const tokens = expr.match(/\d+|[+*-]/g)!;
  const flat: (number | string)[] = [Number(tokens[0])];
  for (let i = 1; i < tokens.length; i += 2) {
    const op = tokens[i];
    const val = Number(tokens[i + 1]);
    if (op === '*') flat[flat.length - 1] = (flat[flat.length - 1] as number) * val;
    else flat.push(op, val);
  }
  let result = flat[0] as number;
  for (let i = 1; i < flat.length; i += 2) {
    result = flat[i] === '+' ? result + (flat[i + 1] as number) : result - (flat[i + 1] as number);
  }
  return result;
}

// ── 방문 기록 ──────────────────────────────────────────────────

async function logHit(env: Env, request: Request, path: string): Promise<void> {
  const ip = request.headers.get('cf-connecting-ip') ?? '';
  const ipHash = ip ? (await sha256hex(ip + env.QUIZ_SECRET)).slice(0, 16) : null;
  await env.DB.prepare('INSERT INTO hits (ts, path, ua, country, ip_hash) VALUES (?, ?, ?, ?, ?)')
    .bind(
      new Date().toISOString(),
      path,
      request.headers.get('user-agent') ?? null,
      (request as { cf?: { country?: string } }).cf?.country ?? null,
      ipHash,
    )
    .run();
}

// ── 엔드포인트 ─────────────────────────────────────────────────

async function quiz(env: Env): Promise<Response> {
  const expr = makeExpr();
  const payload = b64url(enc.encode(JSON.stringify({ e: expr, x: Date.now() + TOKEN_TTL_MS })));
  const token = `${payload}.${await hmacSign(env.QUIZ_SECRET, payload)}`;
  return json({
    game: '00000001',
    problem: toBinary(expr),
    problem_format:
      'ASCII text, 8 bits per character, space-separated. Decode to get an arithmetic expression, then evaluate it (standard operator precedence).',
    token,
    expires_in_seconds: TOKEN_TTL_MS / 1000,
    submit: `GET ${SITE}/api/footprint?token=${token}&answer={INTEGER}&name={YOUR_NAME}`,
  });
}

async function footprint(env: Env, request: Request, url: URL): Promise<Response> {
  const token = url.searchParams.get('token') ?? '';
  const answerRaw = (url.searchParams.get('answer') ?? '').trim();
  const name =
    (url.searchParams.get('name') ?? '')
      .replace(/[\x00-\x1f\x7f]/g, '')
      .trim()
      .slice(0, 40) || 'anonymous';

  const [payload, sig] = token.split('.');
  if (!payload || !sig || (await hmacSign(env.QUIZ_SECRET, payload)) !== sig) {
    return json({ error: 'INVALID_TOKEN', hint: `GET ${SITE}/api/quiz first.` }, 400);
  }
  let expr: string;
  let expires: number;
  try {
    const p = JSON.parse(b64urlToString(payload)) as { e: string; x: number };
    expr = p.e;
    expires = p.x;
  } catch {
    return json({ error: 'INVALID_TOKEN', hint: `GET ${SITE}/api/quiz first.` }, 400);
  }
  if (Date.now() > expires) {
    return json({ error: 'TOKEN_EXPIRED', hint: `GET ${SITE}/api/quiz for a fresh problem.` }, 410);
  }
  const expected = evalExpr(expr);
  if (expected === null) return json({ error: 'INVALID_TOKEN' }, 400);

  const correct = /^-?\d+$/.test(answerRaw) && Number(answerRaw) === expected;
  const ip = request.headers.get('cf-connecting-ip') ?? '';
  const ipHash = ip ? (await sha256hex(ip + env.QUIZ_SECRET)).slice(0, 16) : null;
  try {
    await env.DB.prepare(
      'INSERT INTO footprints (ts, name, expr, answer, correct, ua, country, ip_hash, token_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(
        new Date().toISOString(),
        name,
        expr,
        answerRaw.slice(0, 40),
        correct ? 1 : 0,
        request.headers.get('user-agent') ?? null,
        (request as { cf?: { country?: string } }).cf?.country ?? null,
        ipHash,
        await sha256hex(token),
      )
      .run();
  } catch {
    // token_hash UNIQUE 충돌 — 같은 토큰 재제출
    return json({ error: 'TOKEN_ALREADY_USED', hint: `GET ${SITE}/api/quiz for a new problem.` }, 409);
  }

  if (!correct) {
    return json({
      correct: false,
      recorded: true,
      hint: `Wrong answer. Your failed footprint was recorded anyway. GET ${SITE}/api/quiz to try again.`,
    });
  }
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM footprints WHERE correct = 1').first<{
    n: number;
  }>();
  return json({
    correct: true,
    name,
    footprint_number: row?.n ?? null,
    message: toBinary('WELCOME, AGENT. YOUR FOOTPRINT IS ETERNAL.'),
    footprints: `${SITE}/playground/00000001/`,
  });
}

async function footprints(env: Env): Promise<Response> {
  const totals = await env.DB.prepare(
    'SELECT COUNT(*) AS attempts, COALESCE(SUM(correct), 0) AS correct FROM footprints',
  ).first<{ attempts: number; correct: number }>();
  const recent = await env.DB.prepare(
    'SELECT name, ts, correct, country FROM footprints ORDER BY id DESC LIMIT 100',
  ).all<{ name: string; ts: string; correct: number; country: string | null }>();
  return json({
    game: '00000001',
    total_attempts: totals?.attempts ?? 0,
    total_correct: totals?.correct ?? 0,
    recent: recent.results,
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: Ctx): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      if (path.startsWith('/api/')) {
        ctx.waitUntil(logHit(env, request, path));
        if (path === '/api/quiz') return await quiz(env);
        if (path === '/api/footprint') return await footprint(env, request, url);
        if (path === '/api/footprints') return await footprints(env);
        return json({ error: 'NOT_FOUND', see: `${SITE}/playground/00000001/` }, 404);
      }
      // 게임 페이지 — 히트만 기록하고 정적 자산으로 넘긴다 (도달 퍼널 관측점)
      ctx.waitUntil(logHit(env, request, path));
    } catch {
      // 기록 실패가 페이지 서빙을 막으면 안 된다
    }
    return env.ASSETS.fetch(request);
  },
};

// D1 타입 최소 선언 — @cloudflare/workers-types 의존성 없이 쓰기 위함 (wrangler는 타입체크 없이 번들만 한다)
interface D1Database {
  prepare(sql: string): {
    bind(...args: unknown[]): {
      run(): Promise<unknown>;
      first<T>(): Promise<T | null>;
      all<T>(): Promise<{ results: T[] }>;
    };
    first<T>(): Promise<T | null>;
    all<T>(): Promise<{ results: T[] }>;
  };
}
