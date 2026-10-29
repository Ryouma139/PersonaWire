/* 各ページ。データを読んで HTML を返す。文言は c.t（サイトの言語）、サイトの名前などは c.site から取る */
import type { Ctx, Persona, Product } from './data';
import { amazonStatement, articleCard, day, esc, layout, linkify, productBox, productCard, safeUrl } from './html';

/** そのペルソナ向けの商品（ペルソナ指定なしなら全商品）から最大 n 件。ペルソナ未指定の商品は誰にでも出す */
function pickProducts(products: Product[], handle: string | undefined, n: number, exclude: string[] = []): Product[] {
  return products
    .filter((p) => !exclude.includes(p.id))
    .filter((p) => !handle || !p.persona_handles.length || p.persona_handles.includes(handle))
    .slice(0, n);
}

export async function home(c: Ctx): Promise<string> {
  const [personas, articles, products] = await Promise.all([c.db.personas(), c.db.articles(), c.db.products()]);
  const side = pickProducts(products, undefined, 3).map((p) => productCard(c, p, 'side'));
  return layout(c, { canonical: c.url.origin + '/', personas }, `
    <section class="hero"><h1>${esc(c.site.tagline)}</h1><p>${esc(c.t.heroLead)}</p></section>
    <div class="layout">
      <div>${articles.map((a) => articleCard(c, a)).join('') || `<p class="empty">${esc(c.t.noArticles)}</p>`}</div>
      <aside>${productBox(c, c.t.homePicks, side)}</aside>
    </div>`);
}

export async function personaPage(c: Ctx, handle: string): Promise<string | null> {
  const [personas, articles, products] = await Promise.all([c.db.personas(), c.db.articles(handle), c.db.products()]);
  const p = personas.find((x) => x.handle === handle);
  if (!p) return null;
  const side = pickProducts(products, handle, 3).map((pr) => productCard(c, pr, 'side', { personaHandle: handle }));
  return layout(c, { title: p.name, description: p.description, canonical: `${c.url.origin}/p/${encodeURIComponent(handle)}`, personas, activeHandle: handle }, `
    <section class="hero"><h1>${esc(c.t.personaHero(p.name))}</h1><p>${esc(p.description)}</p></section>
    <div class="layout">
      <div>${articles.map((a) => articleCard(c, a)).join('') || `<p class="empty">${esc(c.t.noPersonaArticles)}</p>`}</div>
      <aside>${productBox(c, c.t.personaPicks(p.name), side)}</aside>
    </div>`);
}

export async function articlePage(c: Ctx, no: number): Promise<string | null> {
  const [personas, a, products, linked] = await Promise.all([c.db.personas(), c.db.article(no), c.db.products(), c.db.articleProductIds(no)]);
  if (!a) return null;
  const href = safeUrl(a.url);
  const handle = a.persona_handle ?? undefined;
  // 記事に紐づけた商品（このサイトで掲載中のもの）だけを出す。紐づけが無ければ商品の枠は出さない
  const chosen = linked.map((id) => products.find((p) => p.id === id)).filter((p): p is Product => !!p);
  const cards = chosen.map((p) => productCard(c, p, 'article', { articleNo: a.no, personaHandle: handle }));

  return layout(c, { title: a.title, description: a.editor_comment, canonical: `${c.url.origin}/a/${a.no}`, personas, activeHandle: handle, ogType: 'article' }, `
    <div class="layout">
      <article class="full">
        <div class="meta">
          ${a.persona_name ? `<a class="persona" href="/p/${esc(a.persona_handle)}" style="--c:${esc(a.persona_color)}">${esc(a.persona_name)}</a>` : ''}
          <span>${esc(a.category)}</span><time datetime="${esc(a.published_at)}">${day(c, a.published_at)}</time>
        </div>
        <h1>${esc(a.title)}</h1>
        <div class="editor"><b>${esc(c.t.editorNote)}</b><p>${linkify(a.editor_comment)}</p></div>
        ${a.excerpt ? `<blockquote class="quote"${href ? ` cite="${esc(href)}"` : ''}>${esc(a.excerpt)}</blockquote>` : ''}
        <p class="src">${esc(c.t.source)}: ${href ? `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(a.source_name)}</a>` : esc(a.source_name)}</p>
        ${href ? `<p><a class="btn" href="${esc(href)}" target="_blank" rel="noopener">${esc(c.t.readOriginal)} ↗</a></p>` : ''}
      </article>
      <aside>${productBox(c, c.t.articlePicks, cards)}</aside>
    </div>`);
}

/** 掲載中の商品の一覧。?p=<ペルソナ> でそのペルソナ向けに絞り、カテゴリごとに並べる */
export async function productsPage(c: Ctx): Promise<string> {
  const [personas, products] = await Promise.all([c.db.personas(), c.db.products()]);
  const p = personas.find((x) => x.handle === c.url.searchParams.get('p'));
  const list = pickProducts(products, p?.handle, products.length);
  const groups = new Map<string, Product[]>();
  for (const pr of list) {
    const cat = pr.category || c.t.otherCategory;
    groups.set(cat, [...(groups.get(cat) ?? []), pr]);
  }
  const chip = (handle: string | undefined, label: string): string =>
    `<a href="/products${handle ? '?p=' + encodeURIComponent(handle) : ''}" class="${p?.handle === handle ? 'on' : ''}">${esc(label)}</a>`;
  return layout(c, { title: c.t.products, description: c.t.productsDescription, canonical: `${c.url.origin}/products`, personas, section: 'products' }, `
    <section class="hero"><h1>${esc(c.t.products)} <small class="pr-tag">${esc(c.t.adLabel)}</small></h1>
      <p>${c.t.productsLead}</p></section>
    <nav class="personas" style="padding-top:12px">${chip(undefined, c.t.all)}${personas.map((x) => chip(x.handle, x.name)).join('')}</nav>
    ${[...groups].map(([cat, items]) => `
      <h2 class="cat">${esc(cat)}</h2>
      <div class="product-grid">${items.map((pr) => productCard(c, pr, 'list', { personaHandle: p?.handle })).join('')}</div>`).join('')
      || `<p class="empty">${esc(c.t.noProducts)}</p>`}`);
}

function prose(c: Ctx, personas: Persona[], title: string, body: string): string {
  return layout(c, { title, canonical: c.url.origin + c.url.pathname, personas }, `<div class="prose" style="max-width:760px;padding:24px 0 48px"><h1>${esc(title)}</h1>${body}</div>`);
}

export async function aboutPage(c: Ctx): Promise<string> {
  const { site, t } = c;
  const contact = safeUrl(site.contact_url) ?? (site.contact_url.startsWith('mailto:') ? site.contact_url : null);
  // Google フォームなら、そのページに埋め込む（https://docs.google.com/forms/... だけ）
  const form = contact?.startsWith('https://docs.google.com/forms/') ? new URL(contact) : null;
  form?.searchParams.set('embedded', 'true');
  const links = [
    [safeUrl(site.operator_site_url), t.operatorSite],
    [safeUrl(site.operator_x_url), t.operatorX],
  ].filter((l): l is [string, string] => !!l[0]);
  return prose(c, await c.db.personas(), t.about, `
    <h2>${esc(t.siteName)}</h2><p>${esc(site.name)}</p>
    <h2>${esc(t.operator)}</h2><p>${esc(site.operator_name || t.preparing)}</p>
    ${links.length ? `<ul>${links.map(([href, label]) => `<li><a href="${esc(href)}" target="_blank" rel="noopener">${esc(label)}</a></li>`).join('')}</ul>` : ''}
    <h2>${esc(t.contact)}</h2>
    ${form && contact ? `<p>${t.formLead(esc(contact))}</p>
    <iframe class="form" src="${esc(form.href)}" title="${esc(t.formTitle)}" loading="lazy">${esc(t.loading)}</iframe>`
      : `<p>${contact ? `<a href="${esc(contact)}">${esc(t.contactLink)}</a>` : esc(t.preparing)}</p>`}
    <h2>${esc(t.aboutHeading)}</h2>
    <p>${esc(t.aboutBody)}</p>`);
}

export async function privacyPage(c: Ctx): Promise<string> {
  return prose(c, await c.db.personas(), c.t.privacy, c.t.privacyBody(c.site, amazonStatement(c)));
}

export async function adPage(c: Ctx): Promise<string> {
  return prose(c, await c.db.personas(), c.t.ad, c.t.adBody(c.site, amazonStatement(c)));
}

export async function notFound(c: Ctx): Promise<string> {
  const personas = await c.db.personas().catch(() => []);
  return layout(c, { title: c.t.notFoundTitle, canonical: c.url.origin + c.url.pathname, personas, noindex: true },
    `<div class="prose" style="padding:32px 0 48px"><h1>${esc(c.t.notFoundTitle)}</h1><p>${esc(c.t.notFoundBody)}</p><p><a class="btn" href="/">${esc(c.t.toTop)}</a></p></div>`);
}
