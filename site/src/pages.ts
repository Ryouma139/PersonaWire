/* 各ページ。データを読んで HTML を返す。文言は c.t（サイトの言語）、サイトの名前などは c.site から取る */
import type { Ctx, Persona, Product } from './data';
import { amazonStatement, articleCard, categoriesOf, day, esc, layout, linkify, productBox, productCard, safeUrl } from './html';

/** そのペルソナ向けの商品（ペルソナ指定なしなら全商品）から最大 n 件。ペルソナ未指定の商品は誰にでも出す */
function pickProducts(products: Product[], handle: string | undefined, n: number, exclude: string[] = []): Product[] {
  return products
    .filter((p) => !exclude.includes(p.id))
    .filter((p) => !handle || !p.persona_handles.length || p.persona_handles.includes(handle))
    .slice(0, n);
}

/*
 * 月ごとの表示。?m=2026-10 で、その月（日本時間）に公開した記事だけを出す。
 * 記事の一覧の上に、記事のある月を新しい順に並べる（例: すべての月 / 2026年10月 (12) / 2026年9月 (3)）
 */
const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;
/** 月を選んだときに出す記事の最大数 */
const MONTH_LIMIT = 300;

/** 日時を、日本時間の「YYYY-MM」にする */
const monthOf = (iso: string): string => new Date(Date.parse(iso) + 9 * 3600e3).toISOString().slice(0, 7);

/** ?m= の月。正しくなければ undefined */
function selectedMonth(c: Ctx): { key: string; range: { from: string; to: string } } | undefined {
  const m = MONTH.exec(c.url.searchParams.get('m') ?? '');
  if (!m) return undefined;
  const y = Number(m[1]), mo = Number(m[2]);
  const next = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
  return { key: m[0], range: { from: `${m[0]}-01T00:00:00+09:00`, to: `${next}-01T00:00:00+09:00` } };
}

/** 記事のある月の切り替え。記事が 1 件も無ければ出さない */
function monthNav(c: Ctx, path: string, dates: string[], current: string | undefined): string {
  const counts = new Map<string, number>();
  for (const d of dates) counts.set(monthOf(d), (counts.get(monthOf(d)) ?? 0) + 1);
  if (!counts.size) return '';
  const link = (key: string | undefined, label: string): string =>
    `<a href="${path}${key ? '?m=' + key : ''}" class="${current === key ? 'on' : ''}">${esc(label)}</a>`;
  return `<nav class="personas months">${link(undefined, c.t.allMonths)}${[...counts]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, n]) => link(key, `${c.t.monthLabel(Number(key.slice(0, 4)), Number(key.slice(5)))} (${n})`))
    .join('')}</nav>`;
}

export async function home(c: Ctx): Promise<string> {
  const month = selectedMonth(c);
  const [personas, articles, dates, products] = await Promise.all([
    c.db.personas(), c.db.articles(undefined, month ? MONTH_LIMIT : 30, month?.range), c.db.publishedDates(), c.db.products(),
  ]);
  const side = pickProducts(products, undefined, 3).map((p) => productCard(c, p, 'side'));
  return layout(c, { canonical: c.url.origin + '/', personas }, `
    <section class="hero"><h1>${esc(c.site.tagline)}</h1><p>${esc(c.t.heroLead)}</p></section>
    ${monthNav(c, '/', dates, month?.key)}
    <div class="layout">
      <div>${articles.map((a) => articleCard(c, a)).join('') || `<p class="empty">${esc(month ? c.t.noMonthArticles : c.t.noArticles)}</p>`}</div>
      <aside>${productBox(c, c.t.homePicks, side)}</aside>
    </div>`);
}

export async function personaPage(c: Ctx, handle: string): Promise<string | null> {
  const month = selectedMonth(c);
  const [personas, articles, dates, products] = await Promise.all([
    c.db.personas(), c.db.articles(handle, month ? MONTH_LIMIT : 30, month?.range), c.db.publishedDates(handle), c.db.products(),
  ]);
  const p = personas.find((x) => x.handle === handle);
  if (!p) return null;
  const path = `/p/${encodeURIComponent(handle)}`;
  const side = pickProducts(products, handle, 3).map((pr) => productCard(c, pr, 'side', { personaHandle: handle }));
  return layout(c, { title: p.name, description: p.description, canonical: c.url.origin + path, personas, activeHandle: handle }, `
    <section class="hero"><h1>${esc(c.t.personaHero(p.name))}</h1><p>${esc(p.description)}</p></section>
    ${monthNav(c, path, dates, month?.key)}
    <div class="layout">
      <div>${articles.map((a) => articleCard(c, a)).join('') || `<p class="empty">${esc(month ? c.t.noMonthArticles : c.t.noPersonaArticles)}</p>`}</div>
      <aside>${productBox(c, c.t.personaPicks(p.name), side)}</aside>
    </div>`);
}

/** 記事ページの下に出す関連記事の数 */
const RELATED = 4;

export async function articlePage(c: Ctx, no: number): Promise<string | null> {
  const [personas, a, products, linked] = await Promise.all([c.db.personas(), c.db.article(no), c.db.products(), c.db.articleProductIds(no)]);
  if (!a) return null;
  const href = safeUrl(a.url);
  const handle = a.persona_handle ?? undefined;
  // 関連記事: 同じペルソナの新しい記事から。足りなければ、ほかの新しい記事で埋める
  const [samePersona, latest] = await Promise.all([handle ? c.db.articles(handle, RELATED + 1) : [], c.db.articles(undefined, RELATED * 2 + 1)]);
  const related = [...new Map([...samePersona, ...latest].filter((x) => x.no !== a.no).map((x) => [x.no, x])).values()].slice(0, RELATED);
  // 記事に紐づけた商品（このサイトで掲載中のもの）だけを出す。紐づけが無ければ商品の枠は出さない
  const chosen = linked.map((id) => products.find((p) => p.id === id)).filter((p): p is Product => !!p);
  const cards = chosen.map((p) => productCard(c, p, 'article', { articleNo: a.no, personaHandle: handle }));

  return layout(c, { title: a.title, description: a.editor_comment, canonical: `${c.url.origin}/a/${a.no}`, personas, activeHandle: handle, ogType: 'article' }, `
    <div class="layout">
      <div>
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
      ${related.length ? `<section class="related"><h2 class="cat">${esc(c.t.relatedArticles)}</h2>${related.map((x) => articleCard(c, x)).join('')}</section>` : ''}
      </div>
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
    // カテゴリが複数（カンマ区切り）の商品は、それぞれのカテゴリに出す
    const cats = categoriesOf(pr.category);
    for (const cat of cats.length ? cats : [c.t.otherCategory]) groups.set(cat, [...(groups.get(cat) ?? []), pr]);
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
