/* 収集先ごとの読み取り結果を、共通の形にそろえる */

export type SourceKind = 'NEWS' | 'YOUTUBE' | 'NOTE' | 'X' | 'THREADS' | 'MEDIUM';

export interface Source {
  id: string;
  kind: SourceKind | null;
  method: 'rss' | 'api' | 'search' | 'notion';
  name: string;
  target: string;
  options: SourceOptions;
}

export interface SourceOptions {
  /** Notion: 何日前までの日付ページを読むか */
  lookback_days?: number;
  /** 取り込まないカテゴリ */
  exclude_categories?: string[];
  /** カテゴリ → 主担当ペルソナのコード（AI 判定までの仮の主担当） */
  category_personas?: Record<string, string[]>;
  /** 1 回の実行で読む記事の最大数（新しい順）。YouTube を各チャンネル 2 本までにする、など。省略時は制限なし */
  max_items?: number;
  /**
   * 1 日（日本時間）に登録する記事の最大数。重複を除いたあとに数えるので、超えた分は翌日以降の実行で拾う。
   * Notion のように 1 回で多く読める収集先が、1 日の上限（DAILY_LIMIT）を使い切らないようにする。省略時は制限なし
   */
  daily_max?: number;
  /** RSS: 記事に付けるカテゴリ（note のマガジン名など） */
  category?: string;
  /** Notion: プロパティ名（省略時は 記事一覧 の列名） */
  properties?: { title?: string; url?: string; site?: string; category?: string };
}

/** 記事 1 件分。articles に入れる前の形 */
export interface Candidate {
  title: string;
  url: string;
  sourceName: string;
  category: string;
  excerpt: string;
  collectedAt: string;
  kind: SourceKind;
}

/** URL のドメインから種別を決める。どれにも当たらなければ fallback（無ければ NEWS） */
export function kindOf(url: string, fallback: SourceKind | null): SourceKind {
  let host = '';
  try {
    host = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return fallback ?? 'NEWS';
  }
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtu.be') return 'YOUTUBE';
  if (host === 'note.com') return 'NOTE';
  if (host === 'x.com' || host === 'twitter.com') return 'X';
  if (host === 'threads.net' || host === 'threads.com') return 'THREADS';
  if (host === 'medium.com' || host.endsWith('.medium.com')) return 'MEDIUM';
  return fallback ?? 'NEWS';
}

/** http(s) の URL だけを通す（H6）。それ以外は null */
export function safeUrl(url: string | undefined): string | null {
  try {
    const u = new URL(String(url ?? '').trim());
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}
