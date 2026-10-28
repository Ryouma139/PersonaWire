/* Persona Wire 収集バッチ（Cloudflare Workers）
 * - 定期実行: wrangler.jsonc の crons（2 時間ごと。日本時間の偶数時）
 * - 手動実行: POST /run
 *     管理画面から: Authorization: Bearer <Supabase のログイン証明書>（承認済みのメンバーだけ）
 *     コマンドから: Authorization: Bearer <RUN_TOKEN>
 */
import { Budget } from './budget';
import { collect, subrequestLimit } from './collect';
import { rest, type Env } from './supabase';

/** 管理画面の URL（カンマ区切り）。ブラウザからの呼び出しは、ここに載っている画面からだけ受け付ける */
const allowedOrigins = (env: Env): string[] => (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);

function cors(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get('Origin') ?? '';
  if (!allowedOrigins(env).includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

const json = (body: unknown, status: number, headers: Record<string, string>): Response =>
  new Response(JSON.stringify(body, null, 2), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers } });

/** RUN_TOKEN か、承認済みメンバー（管理者・編集者）のログイン証明書なら true */
async function allowed(request: Request, env: Env, budget: Budget): Promise<boolean> {
  const token = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return false;
  if (env.RUN_TOKEN && token === env.RUN_TOKEN) return true;
  // 証明書が本物かを Supabase に確かめ、その人の役割を users 表で見る
  const res = await budget.fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${token}` } });
  if (!res.ok) return false;
  const user = (await res.json()) as { id?: string };
  if (!user.id) return false;
  const rows = await rest(env, budget.fetch).select<{ role: string | null }>(`users?select=role&id=eq.${encodeURIComponent(user.id)}`);
  return rows[0]?.role === 'admin' || rows[0]?.role === 'editor';
}

export default {
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(collect(env, 'cron').then((s) => console.log('collect', JSON.stringify(s))));
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    const headers = cors(request, env);
    if (url.pathname !== '/run') return new Response('Persona Wire collector', { status: 404 });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers });
    try {
      // 権限の確認で使った通信も、同じ実行の回数に数える
      const budget = new Budget(subrequestLimit(env));
      if (!(await allowed(request, env, budget))) return json({ error: 'unauthorized' }, 401, headers);
      return json(await collect(env, 'manual', budget), 200, headers);
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : String(e) }, 500, headers);
    }
  },
} satisfies ExportedHandler<Env>;
