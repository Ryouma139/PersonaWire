/* 各ページ。データを読んで HTML を返す */
import type { Api, Env, Persona, Product } from './data';
import { amazonStatement, articleCard, esc, layout, linkify, productBox, productCard, safeUrl } from './html';

/** そのペルソナ向けの商品（ペルソナ指定なしなら全商品）から最大 n 件。ペルソナ未指定の商品は誰にでも出す */
function pickProducts(products: Product[], handle: string | undefined, n: number, exclude: string[] = []): Product[] {
  return products
    .filter((p) => !exclude.includes(p.id))
    .filter((p) => !handle || !p.persona_handles.length || p.persona_handles.includes(handle))
    .slice(0, n);
}

export async function home(env: Env, db: Api, url: URL): Promise<string> {
  const [personas, articles, products] = await Promise.all([db.personas(), db.articles(), db.products()]);
  const side = pickProducts(products, undefined, 3).map((p) => productCard(p, 'side'));
  return layout(env, { canonical: url.origin + '/', personas }, `
    <section class="hero"><h1>${esc(env.SITE_TAGLINE)}</h1><p>ニュースとSNSの話題から、読者像ごとに読むべき記事を選び、編集部のひとことを添えてお届けします。</p></section>
    <div class="layout">
      <div>${articles.map(articleCard).join('') || '<p class="empty">公開中の記事はまだありません。</p>'}</div>
      <aside>${productBox('編集部のおすすめ', side)}</aside>
    </div>`);
}

export async function personaPage(env: Env, db: Api, url: URL, handle: string): Promise<string | null> {
  const [personas, articles, products] = await Promise.all([db.personas(), db.articles(handle), db.products()]);
  const p = personas.find((x) => x.handle === handle);
  if (!p) return null;
  const side = pickProducts(products, handle, 3).map((pr) => productCard(pr, 'side', { personaHandle: handle }));
  return layout(env, { title: p.name, description: p.description, canonical: `${url.origin}/p/${encodeURIComponent(handle)}`, personas, activeHandle: handle }, `
    <section class="hero"><h1>${esc(p.name)} のためのニュース</h1><p>${esc(p.description)}</p></section>
    <div class="layout">
      <div>${articles.map(articleCard).join('') || '<p class="empty">このテーマの公開記事はまだありません。</p>'}</div>
      <aside>${productBox(`${p.name} のおすすめ`, side)}</aside>
    </div>`);
}

export async function articlePage(env: Env, db: Api, url: URL, no: number): Promise<string | null> {
  const [personas, a, products, linked] = await Promise.all([db.personas(), db.article(no), db.products(), db.articleProductIds(no)]);
  if (!a) return null;
  const href = safeUrl(a.url);
  const handle = a.persona_handle ?? undefined;
  // 記事に紐づけた商品を先に、足りなければそのペルソナ向けの商品で 3 件まで埋める
  const chosen = linked.map((id) => products.find((p) => p.id === id)).filter((p): p is Product => !!p);
  const fill = pickProducts(products, handle, Math.max(0, 3 - chosen.length), chosen.map((p) => p.id));
  const cards = [...chosen, ...fill].map((p) => productCard(p, 'article', { articleNo: a.no, personaHandle: handle }));
  const date = new Date(a.published_at).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'long', day: 'numeric' });

  return layout(env, { title: a.title, description: a.editor_comment, canonical: `${url.origin}/a/${a.no}`, personas, activeHandle: handle, ogType: 'article' }, `
    <div class="layout">
      <article class="full">
        <div class="meta">
          ${a.persona_name ? `<a class="persona" href="/p/${esc(a.persona_handle)}" style="--c:${esc(a.persona_color)}">${esc(a.persona_name)}</a>` : ''}
          <span>${esc(a.category)}</span><time datetime="${esc(a.published_at)}">${date}</time>
        </div>
        <h1>${esc(a.title)}</h1>
        <div class="editor"><b>編集部のひとこと</b><p>${linkify(a.editor_comment)}</p></div>
        ${a.excerpt ? `<blockquote class="quote"${href ? ` cite="${esc(href)}"` : ''}>${esc(a.excerpt)}</blockquote>` : ''}
        <p class="src">出典: ${href ? `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(a.source_name)}</a>` : esc(a.source_name)}</p>
        ${href ? `<p><a class="btn" href="${esc(href)}" target="_blank" rel="noopener">元の記事を読む ↗</a></p>` : ''}
      </article>
      <aside>${productBox('この記事に関連するおすすめ', cards)}</aside>
    </div>`);
}

/** 掲載中の商品の一覧。?p=<ペルソナ> でそのペルソナ向けに絞り、カテゴリごとに並べる */
export async function productsPage(env: Env, db: Api, url: URL): Promise<string> {
  const [personas, products] = await Promise.all([db.personas(), db.products()]);
  const p = personas.find((x) => x.handle === url.searchParams.get('p'));
  const list = pickProducts(products, p?.handle, products.length);
  const groups = new Map<string, Product[]>();
  for (const pr of list) groups.set(pr.category || 'その他', [...(groups.get(pr.category || 'その他') ?? []), pr]);
  const chip = (handle: string | undefined, label: string): string =>
    `<a href="/products${handle ? '?p=' + encodeURIComponent(handle) : ''}" class="${p?.handle === handle ? 'on' : ''}">${esc(label)}</a>`;
  return layout(env, { title: 'おすすめ商品', description: '編集部がおすすめする商品・サービスの一覧です（広告を含みます）。', canonical: `${url.origin}/products`, personas, section: 'products' }, `
    <section class="hero"><h1>おすすめ商品 <small class="pr-tag">広告</small></h1>
      <p>読者像ごとに、編集部が選んだ商品・サービスです。このページのリンクはすべてアフィリエイト広告です。<a href="/ad">広告について</a></p></section>
    <nav class="personas" style="padding-top:12px">${chip(undefined, 'すべて')}${personas.map((x) => chip(x.handle, x.name)).join('')}</nav>
    ${[...groups].map(([cat, items]) => `
      <h2 class="cat">${esc(cat)}</h2>
      <div class="product-grid">${items.map((pr) => productCard(pr, 'list', { personaHandle: p?.handle })).join('')}</div>`).join('')
      || '<p class="empty">掲載中の商品はまだありません。</p>'}`);
}

function prose(env: Env, url: URL, personas: Persona[], title: string, body: string): string {
  return layout(env, { title, canonical: url.origin + url.pathname, personas }, `<div class="prose" style="max-width:760px;padding:24px 0 48px"><h1>${esc(title)}</h1>${body}</div>`);
}

export async function aboutPage(env: Env, db: Api, url: URL): Promise<string> {
  const contact = safeUrl(env.CONTACT_URL) ?? (env.CONTACT_URL.startsWith('mailto:') ? env.CONTACT_URL : null);
  return prose(env, url, await db.personas(), '運営者情報', `
    <h2>サイト名</h2><p>${esc(env.SITE_TITLE)}</p>
    <h2>運営者</h2><p>${env.OPERATOR_NAME ? esc(env.OPERATOR_NAME) : '準備中'}</p>
    <h2>お問い合わせ</h2><p>${contact ? `<a href="${esc(contact)}">お問い合わせはこちら</a>` : '準備中'}</p>
    <h2>このサイトについて</h2>
    <p>ニュースやSNSで話題の記事から、読者像（ペルソナ）ごとに役立つものを編集部が選び、ひとことを添えて紹介しています。記事の本文は掲載せず、要約の引用と出典元へのリンクを載せています。</p>`);
}

export async function privacyPage(env: Env, db: Api, url: URL): Promise<string> {
  return prose(env, url, await db.personas(), 'プライバシーポリシー', `
    <h2>当サイトが記録する情報</h2>
    <p>おすすめ商品のリンクが押されたときに、「どの商品が」「どのページのどの枠で」「いつ」押されたかを記録し、掲載内容の改善に使います。IPアドレス、Cookie、端末の情報など、個人を特定できる情報は記録しません。</p>
    <h2>アクセスの記録</h2>
    <p>当サイトは Cloudflare のサービスで配信しており、障害対応や不正なアクセスへの対策のため、Cloudflare がアクセスの記録を一時的に保持することがあります。</p>
    <h2>アフィリエイトプログラムについて</h2>
    <p>当サイトは、Amazonアソシエイト・プログラム、楽天アフィリエイト、A8.net、もしもアフィリエイトに参加しています。商品のリンクを押して移動した先のサイト（各ショップ・各ASP）では、成果を計測するために Cookie などが使われることがあります。その取り扱いは、移動先の各社のプライバシーポリシーに従います。</p>
    <p>${amazonStatement(env)}</p>
    <h2>改定</h2>
    <p>この内容は、必要に応じて改定することがあります。</p>`);
}

export async function adPage(env: Env, db: Api, url: URL): Promise<string> {
  return prose(env, url, await db.personas(), '広告について', `
    <p>当サイトは、アフィリエイト広告を利用しています。「PR」「広告」と表示した商品のリンクから商品が購入・申し込みされると、当サイトに報酬が支払われることがあります。</p>
    <p>参加しているプログラム: Amazonアソシエイト・プログラム、楽天アフィリエイト、A8.net、もしもアフィリエイト</p>
    <p>${amazonStatement(env)}</p>
    <p>記事の選定と編集部のひとことは、広告の有無にかかわらず編集部の判断で行っています。商品の価格や在庫などの最新の情報は、リンク先でご確認ください。</p>`);
}

export async function notFound(env: Env, db: Api, url: URL): Promise<string> {
  const personas = await db.personas().catch(() => []);
  return layout(env, { title: 'ページが見つかりません', canonical: url.origin + url.pathname, personas, noindex: true },
    `<div class="prose" style="padding:32px 0 48px"><h1>ページが見つかりません</h1><p>記事が非公開になったか、URL が変わった可能性があります。</p><p><a class="btn" href="/">トップへ</a></p></div>`);
}
