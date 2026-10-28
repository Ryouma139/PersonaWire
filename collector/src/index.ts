/* Persona Wire 収集バッチ（Cloudflare Workers）
 * - 定期実行: wrangler.jsonc の crons（30 分ごと）
 * - 手動実行: POST /run（Authorization: Bearer <RUN_TOKEN>）
 */
import { collect } from './collect';
import type { Env } from './supabase';

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body, null, 2), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });

export default {
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(collect(env, 'cron').then((s) => console.log('collect', JSON.stringify(s))));
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/run' || request.method !== 'POST') return new Response('Persona Wire collector', { status: 404 });
    if (!env.RUN_TOKEN || request.headers.get('Authorization') !== `Bearer ${env.RUN_TOKEN}`) return json({ error: 'unauthorized' }, 401);
    try {
      return json(await collect(env, 'manual'));
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
