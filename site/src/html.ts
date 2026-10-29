/* ページの共通部品（枠・記事カード・商品カード） */
import type { Article, Asp, Env, Persona, Product } from './data';

export const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** http(s) の URL だけを通す（javascript: などを href に入れない） */
export const safeUrl = (u: string | null | undefined): string | null => {
  try {
    const url = new URL(String(u));
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
};

/**
 * 編集コメントの中の http(s) の URL をリンクにする。ほかの文字はエスケープする。
 * 文末の句読点・閉じかっこはリンクに含めない。編集部が書いたリンクだが、検索エンジンの評価は渡さない（nofollow）
 */
export function linkify(s: string): string {
  let out = '';
  let last = 0;
  for (const m of s.matchAll(/https?:\/\/[^\s<>"'（）「」『』【】、。]+/g)) {
    const text = m[0].replace(/[.,!?;:)\]]+$/, '');
    const href = safeUrl(text);
    out += esc(s.slice(last, m.index));
    out += href ? `<a href="${esc(href)}" target="_blank" rel="nofollow noopener noreferrer">${esc(text)}</a>` : esc(text);
    last = m.index + text.length;
  }
  return out + esc(s.slice(last));
}

const day = (iso: string): string =>
  new Date(iso).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'long', day: 'numeric' });

const yen = (n: number): string => '¥' + n.toLocaleString('ja-JP');

const ASP_LABEL: Record<Asp, string> = {
  amazon: 'Amazonで見る',
  rakuten: '楽天市場で見る',
  a8: '詳しく見る',
  moshimo: '詳しく見る',
  other: '詳しく見る',
};

const KIND_LABEL: Record<string, string> = { NEWS: 'ニュース', YOUTUBE: 'YouTube', NOTE: 'note', X: 'X', THREADS: 'Threads' };

/** Amazon アソシエイトの規約で、サイトに載せることが求められている文 */
export const amazonStatement = (env: Env): string => `Amazonのアソシエイトとして、${esc(env.SITE_TITLE)}は適格販売により収入を得ています。`;

/** 記事の一覧の 1 件 */
export function articleCard(a: Article): string {
  return `
    <article class="card">
      <div class="meta">
        ${a.persona_name ? `<a class="persona" href="/p/${esc(a.persona_handle)}" style="--c:${esc(a.persona_color)}">${esc(a.persona_name)}</a>` : ''}
        <span>${esc(KIND_LABEL[a.kind] ?? a.kind)} · ${esc(a.source_name)}</span>
        <time datetime="${esc(a.published_at)}">${day(a.published_at)}</time>
      </div>
      <h2><a href="/a/${a.no}">${esc(a.title)}</a></h2>
      <p class="comment">${linkify(a.editor_comment)}</p>
    </article>`;
}

/**
 * 商品カード。リンク先はアフィリエイトのリンクそのもの（転送で隠さない）。
 * クリックは、下の CLICK_SCRIPT がこっそり /c に知らせて数える（数えられなくても、リンクはそのまま動く）
 */
export function productCard(p: Product, placement: 'side' | 'article' | 'list', ctx: { articleNo?: number; personaHandle?: string } = {}): string {
  const href = safeUrl(p.url);
  if (!href) return '';
  const img = safeUrl(p.image_url);
  return `
    <a class="product" href="${esc(href)}" target="_blank" rel="sponsored noopener"
       data-pid="${esc(p.id)}" data-s="${placement}"${ctx.articleNo ? ` data-a="${ctx.articleNo}"` : ''}${ctx.personaHandle ? ` data-h="${esc(ctx.personaHandle)}"` : ''}>
      <span class="pr">PR</span>
      ${img ? `<img src="${esc(img)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}
      <strong>${esc(p.name)}</strong>
      <small>${esc(p.category)}${p.price ? ` · ${yen(p.price)}` : ''}</small>
      <span class="go">${ASP_LABEL[p.asp] ?? '詳しく見る'} ↗</span>
    </a>`;
}

export function productBox(title: string, items: string[]): string {
  const cards = items.filter(Boolean);
  if (!cards.length) return '';
  return `<section class="products"><h3>${esc(title)} <small>広告</small></h3>${cards.join('')}</section>`;
}

// 商品リンクのクリックを数える。ページを離れても届く sendBeacon を使う
const CLICK_SCRIPT = `
document.addEventListener('click', count); document.addEventListener('auxclick', count);
function count(e) {
  var a = e.target.closest && e.target.closest('a[data-pid]'); if (!a) return;
  var body = JSON.stringify({ p: a.dataset.pid, s: a.dataset.s, a: a.dataset.a ? Number(a.dataset.a) : null, h: a.dataset.h || null });
  try { navigator.sendBeacon('/c', new Blob([body], { type: 'application/json' })); } catch (_) {}
}`;

const CSS = `
:root { --bg:#f7f6f2; --surface:#fff; --text:#1d1d1f; --text-2:#5f6368; --border:#e3e1da; --accent:#0f8f86; --navy:#13294b; }
* { box-sizing: border-box; }
body { margin:0; background:var(--bg); color:var(--text); font:15px/1.75 "Noto Sans JP", system-ui, -apple-system, "Hiragino Sans", sans-serif; }
a { color:inherit; }
.notice { background:var(--navy); color:#fff; font-size:12px; text-align:center; padding:6px 16px; }
.notice a { color:#fff; }
header.site { background:var(--surface); border-bottom:1px solid var(--border); }
.wrap { max-width:1080px; margin:0 auto; padding:0 16px; }
.head { display:flex; align-items:center; gap:12px; padding:14px 0 10px; }
.head img { width:40px; height:40px; border-radius:8px; }
.head a { text-decoration:none; }
.head strong { display:block; font-size:20px; letter-spacing:.3px; }
.head small { display:block; color:var(--text-2); font-size:12px; }
nav.personas { display:flex; gap:6px; overflow-x:auto; padding:0 0 12px; }
nav.personas a { flex-shrink:0; text-decoration:none; font-size:13px; padding:5px 12px; border-radius:99px; border:1px solid var(--border); background:var(--bg); white-space:nowrap; }
nav.personas a.on { background:var(--navy); color:#fff; border-color:var(--navy); }
.hero { padding:28px 0 8px; }
.hero h1 { font-size:24px; line-height:1.4; margin:0 0 6px; }
.hero p { color:var(--text-2); margin:0; }
.layout { display:grid; grid-template-columns:minmax(0,1fr) 300px; gap:28px; padding:20px 0 48px; }
.card { background:var(--surface); border:1px solid var(--border); border-radius:10px; padding:16px 18px; margin-bottom:12px; }
.card h2 { font-size:17px; line-height:1.5; margin:4px 0 6px; }
.card h2 a { text-decoration:none; }
.card h2 a:hover { text-decoration:underline; }
.meta { display:flex; flex-wrap:wrap; gap:4px 10px; font-size:12px; color:var(--text-2); align-items:center; }
.persona { --c:var(--accent); color:var(--c); font-weight:700; text-decoration:none; }
.comment { margin:0; white-space:pre-line; overflow-wrap:anywhere; }
.products h3 { font-size:14px; margin:0 0 10px; }
.products h3 small { font-size:11px; color:var(--text-2); font-weight:400; border:1px solid var(--border); border-radius:4px; padding:0 4px; margin-left:4px; }
.product { position:relative; display:block; text-decoration:none; background:var(--surface); border:1px solid var(--border); border-radius:10px; padding:14px; margin-bottom:10px; }
.product:hover { border-color:var(--accent); }
.product img { display:block; width:100%; max-height:160px; object-fit:contain; margin-bottom:8px; }
.product strong { display:block; font-size:14px; line-height:1.5; padding-right:34px; }
.product small { display:block; color:var(--text-2); font-size:12px; }
.product .go { display:inline-block; margin-top:8px; font-size:13px; font-weight:700; color:var(--accent); }
.product-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(220px, 1fr)); gap:12px; margin:0 0 28px; }
.product-grid .product { margin:0; }
.cat { font-size:16px; margin:24px 0 10px; }
.pr-tag { font-size:12px; color:var(--text-2); font-weight:400; border:1px solid var(--border); border-radius:4px; padding:0 5px; vertical-align:middle; }
.pr { position:absolute; top:10px; right:10px; font-size:10px; font-weight:700; color:var(--text-2); border:1px solid var(--border); border-radius:4px; padding:0 5px; background:var(--bg); }
article.full h1 { font-size:24px; line-height:1.45; margin:8px 0 16px; }
.editor { border-left:4px solid var(--accent); background:var(--surface); border-radius:0 10px 10px 0; padding:14px 18px; margin:0 0 20px; }
.editor b { display:block; font-size:12px; color:var(--accent); margin-bottom:4px; }
.editor p { margin:0; font-size:16px; white-space:pre-line; overflow-wrap:anywhere; }
blockquote.quote { margin:0 0 6px; padding:12px 16px; background:#efede6; border-radius:8px; color:#3c3c3f; font-size:14px; }
.src { font-size:13px; color:var(--text-2); margin:0 0 20px; }
.btn { display:inline-block; background:var(--navy); color:#fff; text-decoration:none; font-weight:700; padding:10px 18px; border-radius:8px; }
.prose h1 { font-size:22px; }
.prose h2 { font-size:17px; margin-top:28px; }
.empty { color:var(--text-2); padding:24px 0; }
footer.site { border-top:1px solid var(--border); background:var(--surface); font-size:12px; color:var(--text-2); padding:20px 0 28px; }
footer.site nav { display:flex; flex-wrap:wrap; gap:6px 16px; margin-bottom:8px; }
footer.site p { margin:4px 0; }
@media (max-width: 820px) {
  .layout { grid-template-columns:minmax(0,1fr); }
  .hero h1, article.full h1 { font-size:20px; }
}`;

export interface PageOpts {
  title?: string;
  description?: string;
  /** 正規の URL（例: https://…/a/12） */
  canonical: string;
  personas: Persona[];
  activeHandle?: string;
  /** ヘッダーで強調する、ペルソナ以外のページ */
  section?: 'products';
  ogType?: 'website' | 'article';
  noindex?: boolean;
}

export function layout(env: Env, o: PageOpts, body: string): string {
  const fullTitle = o.title ? `${o.title} | ${env.SITE_TITLE}` : `${env.SITE_TITLE} — ${env.SITE_TAGLINE}`;
  const desc = (o.description ?? env.SITE_TAGLINE).replace(/\s+/g, ' ').slice(0, 120);
  const origin = new URL(o.canonical).origin;
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(o.canonical)}">
${o.noindex ? '<meta name="robots" content="noindex">' : ''}
<meta property="og:title" content="${esc(o.title ?? env.SITE_TITLE)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="${o.ogType ?? 'website'}">
<meta property="og:url" content="${esc(o.canonical)}">
<meta property="og:site_name" content="${esc(env.SITE_TITLE)}">
<meta property="og:image" content="${esc(origin)}/logo.png">
<meta name="twitter:card" content="summary">
<link rel="icon" type="image/png" href="/favicon.png">
<link rel="apple-touch-icon" href="/logo.png">
<style>${CSS}</style>
</head>
<body>
<div class="notice">当サイトはアフィリエイト広告（Amazonアソシエイト・楽天アフィリエイト・A8.net・もしもアフィリエイト）を利用しています。<a href="/ad">広告について</a></div>
<header class="site"><div class="wrap">
  <div class="head"><a href="/"><img src="/logo.png" alt=""></a><a href="/"><strong>${esc(env.SITE_TITLE)}</strong><small>${esc(env.SITE_TAGLINE)}</small></a></div>
  <nav class="personas">
    <a href="/" class="${o.activeHandle === undefined && !o.section ? 'on' : ''}">すべて</a>
    ${o.personas.map((p) => `<a href="/p/${esc(p.handle)}" class="${o.activeHandle === p.handle ? 'on' : ''}">${esc(p.name)}</a>`).join('')}
    <a href="/products" class="${o.section === 'products' ? 'on' : ''}">おすすめ商品</a>
  </nav>
</div></header>
<main class="wrap">${body}</main>
<footer class="site"><div class="wrap">
  <nav><a href="/products">おすすめ商品</a><a href="/about">運営者情報</a><a href="/privacy">プライバシーポリシー</a><a href="/ad">広告について</a></nav>
  <p>${amazonStatement(env)}</p>
  <p>記事の要約・引用は各出典元に帰属します。全文は出典元でお読みください。</p>
  <p>© ${esc(env.SITE_TITLE)}</p>
</div></footer>
<script>${CLICK_SCRIPT}</script>
</body>
</html>`;
}
