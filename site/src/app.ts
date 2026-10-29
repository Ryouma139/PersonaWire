/* 公開サイトの共通の Worker（Cloudflare Workers）。各サイトは createSite() に言語の文言と見た目を渡して使う
 *   Persona Wire（日本語）: site/src/index.ts、海外の旅行者向け（英語）: site_adoutor/src/index.ts
 *
 *   /               トップ（新着の公開記事）
 *   /p/<handle>     ペルソナ別のページ
 *   /a/<番号>       記事ページ（編集部のひとこと・要約の引用・出典・関連商品）
 *   /products       おすすめ商品の一覧
 *   /about /privacy /ad   運営者情報・プライバシーポリシー・広告について
 *   POST /c         商品リンクのクリックを数える（ページの中のスクリプトから）
 *   /go/<商品ID>    クリックを数えてからアフィリエイトリンクへ転送する。メールなどスクリプトが動かない場所用。
 *                   Amazon は規約上、転送やメールでの利用ができないので受け付けない
 *   /robots.txt /sitemap.xml
 * ロゴなどの画像は、各サイトの public/ から配信される（Worker より先に返る）
 * サイトの名前・言語・運営者情報は DB の sites（SITE_CODE の行）から読み、記事・商品もそのサイトの分だけを出す
 */
import { api, type Api, type Ctx, type Env } from './data';
import { aboutPage, adPage, articlePage, home, notFound, personaPage, privacyPage, productsPage } from './pages';
import type { Text } from './text';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HANDLE = /^[A-Za-z0-9_-]{1,64}$/;

const html = (body: string, status = 200): Response =>
  new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': status === 200 ? 'public, max-age=300' : 'no-store' } });

async function clickBeacon(request: Request, db: Api, url: URL): Promise<Response> {
  // 他のサイトから数を水増しされないよう、このサイトのページからの送信だけ受け付ける
  const origin = request.headers.get('Origin');
  if (origin && origin !== url.origin) return new Response(null, { status: 403 });
  const b = (await request.json().catch(() => null)) as { p?: unknown; s?: unknown; a?: unknown; h?: unknown } | null;
  if (!b || typeof b.p !== 'string' || !UUID.test(b.p)) return new Response(null, { status: 400 });
  const placement = b.s === 'side' || b.s === 'article' ? b.s : 'other';
  const articleNo = typeof b.a === 'number' && Number.isInteger(b.a) && b.a > 0 ? b.a : null;
  const handle = typeof b.h === 'string' && HANDLE.test(b.h) ? b.h : null;
  await db.recordClick(b.p, placement, articleNo, handle);
  return new Response(null, { status: 204 });
}

async function go(db: Api, url: URL, id: string): Promise<Response | null> {
  if (!UUID.test(id)) return null;
  const product = (await db.products()).find((p) => p.id === id);
  if (!product || product.asp === 'amazon') return null;
  const placement = url.searchParams.get('s') === 'email' ? 'email' : 'other';
  const dest = await db.recordClick(id, placement, null, null);
  if (!dest) return null;
  return new Response(null, { status: 302, headers: { Location: dest, 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
}

async function sitemap(db: Api, url: URL): Promise<Response> {
  const [personas, articles] = await Promise.all([db.personas(), db.articles(undefined, 1000)]);
  const urls = [
    `${url.origin}/`,
    `${url.origin}/products`,
    ...personas.map((p) => `${url.origin}/p/${encodeURIComponent(p.handle)}`),
    ...articles.map((a) => `${url.origin}/a/${a.no}`),
  ];
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${u}</loc></url>`).join('\n')}\n</urlset>`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}

export interface SiteOptions {
  /** 画面の文言（サイトの言語） */
  text: Text;
  /** 見た目の上書き（:root の色など）。共通の CSS のあとに入る */
  theme?: string;
}

export function createSite(opts: SiteOptions): ExportedHandler<Env> {
  return {
    async fetch(request, env) {
      const url = new URL(request.url);
      const db = api(env);
      const path = url.pathname.replace(/\/+$/, '') || '/';
      const t = opts.text;
      try {
        if (path === '/c') return request.method === 'POST' ? await clickBeacon(request, db, url) : new Response(null, { status: 405 });
        if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method Not Allowed', { status: 405 });
        if (path === '/robots.txt') return new Response(`User-agent: *\nDisallow: /go/\nSitemap: ${url.origin}/sitemap.xml\n`, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
        if (path === '/sitemap.xml') return await sitemap(db, url);
        let m = /^\/go\/([^/]+)$/.exec(path);
        if (m) {
          const res = await go(db, url, m[1]);
          if (res) return res;
        }

        const site = await db.site();
        if (!site) throw new Error(`サイト ${env.SITE_CODE} が DB（sites）に無いか、無効です`);
        const c: Ctx = { env, db, url, site, t, theme: opts.theme ?? '' };

        if (path === '/') return html(await home(c));
        if (path === '/products') return html(await productsPage(c));
        if (path === '/about') return html(await aboutPage(c));
        if (path === '/privacy') return html(await privacyPage(c));
        if (path === '/ad') return html(await adPage(c));
        m = /^\/p\/([^/]+)$/.exec(path);
        if (m && HANDLE.test(decodeURIComponent(m[1]))) {
          const page = await personaPage(c, decodeURIComponent(m[1]));
          if (page) return html(page);
        }
        m = /^\/a\/(\d{1,12})$/.exec(path);
        if (m) {
          const page = await articlePage(c, Number(m[1]));
          if (page) return html(page);
        }
        return html(await notFound(c), 404);
      } catch (e) {
        console.error('site error', e instanceof Error ? e.message : e);
        return new Response(t.error, { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
      }
    },
  };
}
