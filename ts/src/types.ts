/* Persona Wire — データの型定義 */

export type PersonaId = string;

export interface Persona {
  id: PersonaId;
  code: string;
  name: string;
  handle: string;
  color: string;
  description: string;
  keywords: string[];
  ngWords: string[];
  tone: string;
  threshold: number;
  active: boolean;
}

export type SourceKind = 'NEWS' | 'YOUTUBE' | 'NOTE' | 'X' | 'THREADS' | 'MEDIUM';
export type ItemType = 'news' | 'sns';
export type Verdict = 'adopt' | 'hold' | 'reject';
export type ItemStatus = 'pending' | 'approved' | 'rejected' | 'published';
export type NotionDbName = 'articles' | 'sns_posts' | 'ideas';

export interface Item {
  id: string;
  no: number;
  type: ItemType;
  kind: SourceKind;
  source: string;
  category: string;
  title: string;
  excerpt: string;
  url: string;
  comment: string;
  reasons: Record<PersonaId, string[]>;
  notionDb: NotionDbName;
  scores: Record<PersonaId, number>;
  status: ItemStatus;
  collectedAt: string;
  /** DB に登録された日時。収集バッチで入った記事なら、バッチの取得日時 */
  fetchedAt: string;
  /** 最後に更新された日時。却下した記事は、ここから 5 日で自動削除される（collector/）*/
  updatedAt: string;
  /** 収集バッチで入った記事の収集先。手で追加した記事は null */
  sourceId: string | null;
  /** null = AI 判定待ち（スコアがまだ無い） */
  verdict: Verdict | null;
  persona: PersonaId | null;
  /** 記事ページに出す、手で選んだ関連商品 */
  productIds: string[];
}

export type DeliveryStatus = 'active' | 'paused';

export interface Delivery {
  id: string;
  name: string;
  persona: PersonaId;
  price: number;
  channel: string;
  cadence: string;
  subscribers: number;
  openRate: number;
  status: DeliveryStatus;
}

export type IssueStatus = 'draft' | 'scheduled' | 'sent';

export interface Issue {
  id: string;
  deliveryId: string;
  no: number;
  title: string;
  intro: string;
  status: IssueStatus;
  scheduledAt: string;
  itemIds: string[];
  sentAt: string | null;
  opens: number | null;
}

/** アフィリエイトの提供元（ASP） */
export type Asp = 'amazon' | 'rakuten' | 'a8' | 'moshimo' | 'other';

export interface Product {
  id: string;
  name: string;
  category: string;
  asp: Asp;
  /** ASP が発行したアフィリエイトリンク（https） */
  url: string;
  imageUrl: string | null;
  price: number;
  /** 社内メモ（公開しない） */
  note: string;
  personaIds: PersonaId[];
  active: boolean;
  /** 掲載期間（空 = 制限なし） */
  startsAt: string | null;
  endsAt: string | null;
  /** 成果・報酬。ASP の管理画面を見て手で入れる（累計） */
  conversions: number;
  revenue: number;
  /** クリック数（公開サイトで記録したもの） */
  clicks30: number;
  clicksTotal: number;
}

export type SyncDirection = 'both' | 'push' | 'pull';
export type NotionDbKey = 'items' | 'scores' | 'personas' | 'issues' | 'products';

export interface NotionDatabase {
  key: NotionDbKey;
  label: string;
  dbName: string;
  direction: SyncDirection;
  enabled: boolean;
}

export interface NotionMapping {
  field: string;
  prop: string;
  type: string;
}

export interface NotionLog {
  at: string;
  ok: boolean;
  text: string;
}

export interface NotionState {
  connected: boolean;
  workspace: string;
  token: string;
  lastSync: string;
  syncing: boolean;
  autoSync: boolean;
  interval: number;
  databases: NotionDatabase[];
  mapping: NotionMapping[];
  logs: NotionLog[];
}

export interface DailyStat {
  d: string;
  news: number;
  sns: number;
  adopted: number;
}

export interface Activity {
  at: string;
  text: string;
  /** 操作した人の名前。自動処理は「システム」 */
  who?: string;
}

/** 収集バッチ（collector/）の実行履歴 1 回分 */
export interface CollectRun {
  startedAt: string;
  finishedAt: string | null;
  trigger: 'cron' | 'manual';
  /** null = 実行中 */
  ok: boolean | null;
  inserted: number;
  skipped: number;
  /** 却下から日数がたったので削除した記事数 */
  purged: number;
  message: string;
}

export interface SiteConfig {
  title: string;
  /** 公開サイトの URL（末尾の / なし） */
  url: string;
}

/** 売上の種類。購読（note メンバーシップなど）と、ASP ごとのアフィリエイト報酬 */
export type RevenueSource = 'subscription' | Asp;

/** 手入力の売上。1 件 = ある月の、ある種類の金額（円） */
export interface Revenue {
  /** YYYY-MM */
  month: string;
  source: RevenueSource;
  amount: number;
}

/** クリックの集計（公開サイトで記録したもの。同じ人・同じ商品は 1 日 1 回） */
export interface ClickStats {
  /** 記事ごと（記事ページの商品枠で押されたもの） */
  articles: Array<{ articleId: string; clicks30: number; clicksTotal: number }>;
  /** 日ごと（日本時間の YYYY-MM-DD、直近 90 日。クリックが無い日は入らない） */
  daily: Array<{ day: string; clicks: number }>;
}

export interface AppState {
  personas: Persona[];
  items: Item[];
  deliveries: Delivery[];
  issues: Issue[];
  products: Product[];
  clicks: ClickStats;
  revenues: Revenue[];
  notion: NotionState;
  activity: Activity[];
  runs: CollectRun[];
  site: SiteConfig;
}

/** 各画面は render(root) だけを公開する */
export interface View {
  render(root: HTMLElement): void;
}
