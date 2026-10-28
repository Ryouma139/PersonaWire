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

export type SourceKind = 'NEWS' | 'YOUTUBE' | 'NOTE' | 'X' | 'THREADS';
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
  verdict: Verdict;
  persona: PersonaId | null;
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

export interface Product {
  id: string;
  name: string;
  category: string;
  url: string;
  price: number;
  personaIds: PersonaId[];
  clicks: number;
  conversions: number;
  active: boolean;
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

export interface SiteConfig {
  title: string;
  domain: string;
}

export interface AppState {
  personas: Persona[];
  items: Item[];
  deliveries: Delivery[];
  issues: Issue[];
  products: Product[];
  notion: NotionState;
  activity: Activity[];
  site: SiteConfig;
}

/** 各画面は render(root) だけを公開する */
export interface View {
  render(root: HTMLElement): void;
}
