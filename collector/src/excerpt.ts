/* 要約が空の記事に、元記事のページの概要（og:description など）を入れる */
import type { Fetch } from './budget';
import { plain } from './rss';
import type { Rest } from './supabase';

/** ページの先頭から最大この大きさだけ読む。概要は <head> の中にあるので、本文までは読まない */
const MAX_BYTES = 120_000;
const TIMEOUT_MS = 6000;

/** <head> の中の概要。og:description → twitter:description → description の順に探す */
export function findDescription(html: string): string {
  const head = html.split(/<\/head>/i)[0];
  const metas = head.match(/<meta\b[^>]*>/gi) ?? [];
  const attr = (tag: string, name: string): string =>
    new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(tag)?.slice(2).find((v) => v !== undefined) ?? '';
  for (const key of ['og:description', 'twitter:description', 'description']) {
    const tag = metas.find((m) => (attr(m, 'property') || attr(m, 'name')).toLowerCase() === key);
    const content = tag ? plain(attr(tag, 'content')) : '';
    if (content) return content;
  }
  return '';
}

/** ページの先頭部分だけを読む。</head> が見つかるか、MAX_BYTES に達したら打ち切る */
async function readHead(f: Fetch, url: string): Promise<string> {
  const res = await f(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PersonaWireCollector/0.1)', Accept: 'text/html' },
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok || !res.body || !(res.headers.get('content-type') ?? '').includes('html')) {
    await res.body?.cancel();
    return '';
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let html = '';
  while (html.length < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    html += decoder.decode(value, { stream: true });
    if (/<\/head>/i.test(html)) break;
  }
  await reader.cancel().catch(() => {});
  return html;
}

/**
 * 要約が空で、まだ試していない記事を新しい順に limit 件まで取りに行き、まとめて書き込む。
 * 却下した記事と、Notion のページ自体の URL（中身は非公開）は対象にしない
 */
export async function fillExcerpts(db: Rest, limit: number, f: Fetch = fetch): Promise<{ tried: number; filled: number }> {
  if (limit <= 0) return { tried: 0, filled: 0 };
  const rows = await db.select<{ id: string; url: string }>(
    `articles?select=id,url&excerpt=eq.&excerpt_checked_at=is.null&status=neq.rejected&url=not.like.*notion.so*&order=collected_at.desc&limit=${limit}`,
  );
  if (!rows.length) return { tried: 0, filled: 0 };
  const items = await Promise.all(rows.map(async (r) => {
    try {
      return { id: r.id, excerpt: findDescription(await readHead(f, r.url)) };
    } catch {
      return { id: r.id, excerpt: '' }; // 時間切れ・接続できないなど。試したことだけ記録する
    }
  }));
  await db.rpc<number>('set_article_excerpts', { items });
  return { tried: rows.length, filled: items.filter((i) => i.excerpt).length };
}
