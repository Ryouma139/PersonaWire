/* Supabase の公開用ビュー（public_*）を読む。鍵は公開用（Publishable key）だけを使う */

export interface Env {
  ASSETS: Fetcher;
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  SITE_TITLE: string;
  SITE_TAGLINE: string;
  OPERATOR_NAME: string;
  CONTACT_URL: string;
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
  url: string;
  image_url: string | null;
  price: number;
  persona_handles: string[];
}

const ARTICLE_COLS = 'no,kind,source_name,category,title,excerpt,url,editor_comment,collected_at,published_at,persona_handle,persona_code,persona_name,persona_color';

export function api(env: Env) {
  const headers = { apikey: env.SUPABASE_PUBLISHABLE_KEY };

  async function get<T>(path: string): Promise<T[]> {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, { headers });
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
    return (await res.json()) as T[];
  }

  return {
    personas: () => get<Persona>('public_personas?select=*&order=code'),
    articles: (personaHandle?: string, limit = 30) =>
      get<Article>(`public_articles?select=${ARTICLE_COLS}${personaHandle ? `&persona_handle=eq.${encodeURIComponent(personaHandle)}` : ''}&order=published_at.desc&limit=${limit}`),
    article: async (no: number) => (await get<Article>(`public_articles?select=${ARTICLE_COLS}&no=eq.${no}`))[0],
    products: () => get<Product>('public_products?select=*&order=name'),
    /** 記事に手で紐づけた商品の ID */
    articleProductIds: async (no: number) =>
      (await get<{ product_id: string }>(`public_article_products?select=product_id&article_no=eq.${no}`)).map((r) => r.product_id),

    /** クリックを記録し、転送先を返す（掲載中でない商品なら null） */
    async recordClick(product: string, placement: string, articleNo: number | null, personaHandle: string | null): Promise<string | null> {
      const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/record_click`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ product, placement, article_no: articleNo, persona_handle: personaHandle }),
      });
      if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
      return (await res.json()) as string | null;
    },
  };
}

export type Api = ReturnType<typeof api>;
