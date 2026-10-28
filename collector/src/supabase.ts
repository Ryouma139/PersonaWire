import type { Fetch } from './budget';

/* Supabase の REST API（PostgREST）を Secret key で呼ぶ。RLS の対象外になるので、Worker の中だけで使う */

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SECRET_KEY: string;
  NOTION_TOKEN?: string;
  RUN_TOKEN?: string;
  DAILY_LIMIT?: string;
  /** 却下した記事を、最後の更新から何日で削除するか */
  PURGE_REJECTED_DAYS?: string;
  /** 1 回の実行で、元記事の概要を取りに行く記事の数 */
  EXCERPT_LIMIT?: string;
  /** 1 回の実行で外部に通信できる回数。無料プランは 50。有料プランにしたら上げる */
  SUBREQUEST_LIMIT?: string;
  ALLOWED_ORIGINS?: string;
}

export type Rest = ReturnType<typeof rest>;

/** f: 通信に使う fetch。Budget.fetch を渡すと、通信の回数が数えられる */
export function rest(env: Env, f: Fetch = fetch) {
  const key = env.SUPABASE_SECRET_KEY;
  if (!env.SUPABASE_URL || !key) throw new Error('SUPABASE_URL と SUPABASE_SECRET_KEY を設定してください');
  // 新しい形式の鍵（sb_secret_...）は apikey ヘッダーだけで送る。古い形式（JWT）は Authorization にも入れる
  const auth: Record<string, string> = key.startsWith('sb_') ? { apikey: key } : { apikey: key, Authorization: `Bearer ${key}` };

  async function call(method: string, path: string, body?: unknown, prefer?: string): Promise<Response> {
    const res = await f(`${env.SUPABASE_URL}/rest/v1/${path}`, {
      method,
      headers: { ...auth, 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Supabase ${method} ${path.split('?')[0]}: ${res.status} ${await res.text()}`);
    return res;
  }

  return {
    async select<T>(path: string): Promise<T[]> {
      return (await call('GET', path)).json() as Promise<T[]>;
    },
    /** 条件に合う行数（中身は取らない） */
    async count(path: string): Promise<number> {
      const res = await call('GET', path, undefined, 'count=exact');
      return Number(res.headers.get('content-range')?.split('/')[1] ?? 0);
    },
    /** 追加した行を返す。ignoreDuplicates なら onConflict の列が重複する行は飛ばす */
    async insert<T>(table: string, rows: unknown, opts: { select?: string; onConflict?: string; ignoreDuplicates?: boolean } = {}): Promise<T[]> {
      const q = new URLSearchParams();
      if (opts.select) q.set('select', opts.select);
      if (opts.onConflict) q.set('on_conflict', opts.onConflict);
      const prefer = [opts.select ? 'return=representation' : 'return=minimal', opts.ignoreDuplicates ? 'resolution=ignore-duplicates' : ''].filter(Boolean).join(',');
      const res = await call('POST', `${table}?${q}`, rows, prefer);
      return opts.select ? (res.json() as Promise<T[]>) : [];
    },
    async update(path: string, patch: unknown): Promise<void> {
      await call('PATCH', path, patch, 'return=minimal');
    },
    /** DB の関数を呼ぶ（supabase/migrations の create function） */
    async rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
      return (await call('POST', `rpc/${name}`, args)).json() as Promise<T>;
    },
  };
}

/** PostgREST の in.(...) に入れる値。URL にはカンマや括弧が入るので、ダブルクォートで囲む */
export const inList = (values: string[]): string =>
  `in.(${values.map((v) => `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',')})`;
