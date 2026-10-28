/* Notion: news_link（親ページ）→ 日付ページ → 記事一覧（データベース）をたどって読む */
import { kindOf, type Candidate, type Source } from './candidate';

const NOTION_VERSION = '2022-06-28';

interface Block {
  id: string;
  type: string;
  created_time: string;
  child_page?: { title: string };
}

interface Page {
  id: string;
  url: string;
  created_time: string;
  properties: Record<string, Property>;
}

type Property =
  | { type: 'title'; title: Array<{ plain_text: string }> }
  | { type: 'rich_text'; rich_text: Array<{ plain_text: string }> }
  | { type: 'url'; url: string | null }
  | { type: 'select'; select: { name: string } | null }
  | { type: string };

async function notion<T>(token: string, path: string, body?: unknown): Promise<T> {
  // レート制限（429）のときは、言われた秒数だけ待って 3 回までやり直す
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`https://api.notion.com/v1${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 429 && attempt < 3) {
      await new Promise((r) => setTimeout(r, Number(res.headers.get('Retry-After') ?? 1) * 1000));
      continue;
    }
    if (!res.ok) throw new Error(`Notion ${path.split('?')[0]}: ${res.status} ${await res.text()}`);
    return res.json() as Promise<T>;
  }
}

async function children(token: string, blockId: string): Promise<Block[]> {
  const out: Block[] = [];
  let cursor: string | null = null;
  do {
    const q = new URLSearchParams({ page_size: '100', ...(cursor ? { start_cursor: cursor } : {}) });
    const r: { results: Block[]; next_cursor: string | null } = await notion(token, `/blocks/${blockId}/children?${q}`);
    out.push(...r.results);
    cursor = r.next_cursor;
  } while (cursor);
  return out;
}

async function rows(token: string, databaseId: string): Promise<Page[]> {
  const out: Page[] = [];
  let cursor: string | null = null;
  do {
    const r: { results: Page[]; next_cursor: string | null } = await notion(token, `/databases/${databaseId}/query`, { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) });
    out.push(...r.results);
    cursor = r.next_cursor;
  } while (cursor);
  return out;
}

const text = (p: Property | undefined): string => {
  if (!p) return '';
  if ('title' in p) return p.title.map((t) => t.plain_text).join('').trim();
  if ('rich_text' in p) return p.rich_text.map((t) => t.plain_text).join('').trim();
  if ('url' in p) return p.url ?? '';
  if ('select' in p) return p.select?.name ?? '';
  return '';
};

/** 日付ページのタイトル（2026/10/28）から日付を読む。読めなければ作成日時 */
function pageDate(b: Block): number {
  const m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(b.child_page?.title.trim() ?? '');
  return m ? Date.parse(`${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}T00:00:00+09:00`) : Date.parse(b.created_time);
}

export async function notionCandidates(token: string | undefined, source: Source): Promise<Candidate[]> {
  if (!token) throw new Error('NOTION_TOKEN が設定されていません');
  const o = source.options;
  const names = { title: '', url: '出典URL', site: 'サイト', category: 'カテゴリ', ...o.properties };
  const since = Date.now() - (o.lookback_days ?? 3) * 864e5;

  const datePages = (await children(token, source.target)).filter((b) => b.type === 'child_page' && pageDate(b) >= since);
  const out: Candidate[] = [];
  for (const dp of datePages) {
    const dbs = (await children(token, dp.id)).filter((b) => b.type === 'child_database');
    for (const db of dbs) {
      for (const page of await rows(token, db.id)) {
        const props = page.properties;
        const titleProp = names.title ? props[names.title] : Object.values(props).find((p) => p.type === 'title');
        const urlProp = props[names.url] ?? Object.values(props).find((p) => p.type === 'url');
        const url = text(urlProp) || page.url; // 出典URL が空なら、Notion のページ自体の URL
        out.push({
          title: text(titleProp),
          url,
          sourceName: text(props[names.site]) || hostOf(url),
          category: text(props[names.category]),
          excerpt: '',
          collectedAt: page.created_time,
          kind: kindOf(url, source.kind),
        });
      }
    }
  }
  return out;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'Notion';
  }
}
