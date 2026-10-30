/* Supabase の公開用ビュー（public_*）を読む。鍵は公開用（Publishable key）だけを使う。
 * どのビューも、このサイトのコード（SITE_CODE）で絞り込む */
import type { Text } from './text';

export interface Env {
  ASSETS: Fetcher;
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  /** sites.code。サイトの名前・言語・運営者情報は、DB の sites から読む */
  SITE_CODE: string;
}

/** サイトの設定（public_sites） */
export interface Site {
  code: string;
  name: string;
  tagline: string;
  locale: string;
  url: string;
  operator_name: string;
  operator_site_url: string;
  operator_x_url: string;
  contact_url: string;
}

export interface Persona {
  code: string;
  name: string;
  handle: string;
  color: string;
  description: string;
}

export interface Article {
  no: number;
  kind: string;
  source_name: string;
  category: string;
  title: string;
  excerpt: string;
  url: string;
  editor_comment: string;
  collected_at: string;
  published_at: string;
  persona_handle: string | null;
  persona_code: string | null;
  persona_name: string | null;
  persona_color: string | null;
}

export type Asp = 'amazon' | 'rakuten' | 'a8' | 'moshimo' | 'other';

export interface Product {
  id: string;
  name: string;
  category: string;
  asp: Asp;
  /** このサイト用のアフィリエイトリンク */
  url: string;
  image_url: string | null;
  price: number;
  persona_handles: string[];
}

/** 1 回のリクエストで使うもの。各ページに渡す */
export interface Ctx {
  env: Env;
  db: Api;
  url: URL;
  site: Site;
  t: Text;
  /** サイトごとの見た目（CSS の上書き） */
  theme: string;
}

const ARTICLE_COLS = 'no,kind,source_name,category,title,excerpt,url,editor_comment,collected_at,published_at,persona_handle,persona_code,persona_name,persona_color';

export function api(env: Env) {
  const headers = { apikey: env.SUPABASE_PUBLISHABLE_KEY };
  const site = `site_code=eq.${encodeURIComponent(env.SITE_CODE)}`;

  async function get<T>(path: string): Promise<T[]> {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, { headers });
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
    return (await res.json()) as T[];
  }

  return {
    /** このサイトの設定。無効か、無いときは undefined */
    site: async () => (await get<Site>(`public_sites?select=*&code=eq.${encodeURIComponent(env.SITE_CODE)}`))[0],
    personas: () => get<Persona>(`public_personas?select=code,name,handle,color,description&${site}&order=code`),
    /** 公開記事を新しい順に。range を渡すと、その期間（from 以上 to 未満）に公開したものだけ */
    articles: (personaHandle?: string, limit = 30, range?: { from: string; to: string }) =>
      get<Article>(`public_articles?select=${ARTICLE_COLS}&${site}${personaHandle ? `&persona_handle=eq.${encodeURIComponent(personaHandle)}` : ''}${range ? `&published_at=gte.${encodeURIComponent(range.from)}&published_at=lt.${encodeURIComponent(range.to)}` : ''}&order=published_at.desc&limit=${limit}`),
    /** 公開日時だけ（月ごとの一覧を作るため） */
    publishedDates: async (personaHandle?: string) =>
      (await get<{ published_at: string }>(`public_articles?select=published_at&${site}${personaHandle ? `&persona_handle=eq.${encodeURIComponent(personaHandle)}` : ''}&order=published_at.desc&limit=5000`)).map((r) => r.published_at),
    article: async (no: number) => (await get<Article>(`public_articles?select=${ARTICLE_COLS}&${site}&no=eq.${no}`))[0],
    products: () => get<Product>(`public_products?select=id,name,category,asp,url,image_url,price,persona_handles&${site}&order=name`),
    /** 記事に手で紐づけた商品の ID */
    articleProductIds: async (no: number) =>
      (await get<{ product_id: string }>(`public_article_products?select=product_id&${site}&article_no=eq.${no}`)).map((r) => r.product_id),

    /** クリックを記録し、このサイト用の転送先を返す（このサイトで掲載中でない商品なら null） */
    async recordClick(product: string, placement: string, articleNo: number | null, personaHandle: string | null): Promise<string | null> {
      const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/record_click`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ product, placement, article_no: articleNo, persona_handle: personaHandle, site: env.SITE_CODE }),
      });
      if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
      return (await res.json()) as string | null;
    },
  };
}

export type Api = ReturnType<typeof api>;
