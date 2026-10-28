/* Persona Wire — データストア
 * ペルソナ・記事・操作ログ: Supabase の表から読み込む（db.ts）。画面の操作は DB に書き込む
 * 有料配信・商品・Notion: まだサンプルデータ。localStorage に保存する（第3・第4段階で DB に移す）
 */
import type { AppState, Delivery, Issue, Item, ItemStatus, Persona, PersonaId, Verdict } from './types';
import { db, dbMessage } from './db';
import { auth } from './auth';
import * as ui from './ui';

// v4: ペルソナ・記事・操作ログ（と収集の実行履歴）を DB に移し、ブラウザには保存しなくなった
const KEY = 'persona-wire:v4';
const listeners: Array<() => void> = [];

export const uid = (p: string): string => p + Math.random().toString(36).slice(2, 9);

/** 配信号に入れられる記事の状態（採用済み・公開中） */
export const isUsable = (status: ItemStatus): boolean => status === 'approved' || status === 'published';

/** AI 判定のスコアが 1 つでもあるか。無ければ判定待ち */
export const hasScores = (it: Pick<Item, 'scores'>): boolean => Object.keys(it.scores).length > 0;

// AI 判定: 最も高いペルソナスコアとしきい値から判定を出す
function judgeWith(item: Pick<Item, 'scores'>, personas: Persona[]): { verdict: Verdict; persona: PersonaId | null } {
  let best: { id: PersonaId; score: number; threshold: number } | null = null;
  for (const p of personas.filter((x) => x.active)) {
    const s = item.scores[p.id] ?? 0;
    if (!best || s > best.score) best = { id: p.id, score: s, threshold: p.threshold };
  }
  if (!best) return { verdict: 'reject', persona: null };
  const verdict: Verdict = best.score >= best.threshold ? 'adopt' : best.score >= best.threshold - 20 ? 'hold' : 'reject';
  return { verdict, persona: best.id };
}

/** 有料配信・商品・Notion のサンプル。ペルソナは p1〜p5 で書き、DB を読んだあとにコード（P01〜）で付け替える */
type LocalState = Omit<AppState, 'personas' | 'items' | 'activity' | 'runs'>;

function seedLocal(): LocalState {
  return {
    deliveries: [
      { id: 'd1', name: 'Tech Investor Weekly', persona: 'p1', price: 980, channel: 'メール', cadence: '毎週月曜 7:00', subscribers: 312, openRate: 64, status: 'active' },
      { id: 'd2', name: 'ひとり暮らし改善レター', persona: 'p4', price: 500, channel: 'LINE', cadence: '毎週水・土 20:00', subscribers: 528, openRate: 71, status: 'active' },
      { id: 'd3', name: '節約筋トレ通信', persona: 'p2', price: 380, channel: 'メール', cadence: '毎週金曜 12:00', subscribers: 204, openRate: 66, status: 'active' },
      { id: 'd4', name: 'ローカル移住ノート', persona: 'p5', price: 680, channel: 'メール', cadence: '隔週金曜 12:00', subscribers: 146, openRate: 58, status: 'paused' },
    ],
    issues: [
      { id: 'is1', deliveryId: 'd1', no: 42, title: 'AI推論チップに80億円、半導体決算の読み方', intro: '今週はAIインフラ関連の大型ニュースが続きました。', status: 'draft', scheduledAt: '2026-11-02T07:00', itemIds: [], sentAt: null, opens: null },
      { id: 'is2', deliveryId: 'd1', no: 41, title: '熊本の半導体投資、次の焦点', intro: '', status: 'sent', scheduledAt: '2026-10-26T07:00', itemIds: [], sentAt: '2026-10-26T07:00', opens: 201 },
      { id: 'is3', deliveryId: 'd2', no: 88, title: '固定費を月1.5万円減らす', intro: '今週は家計と、仕事終わりの時間の使い方を特集します。', status: 'draft', scheduledAt: '2026-10-28T20:00', itemIds: [], sentAt: null, opens: null },
      { id: 'is4', deliveryId: 'd3', no: 15, title: '1食300円の高タンパク献立', intro: '', status: 'draft', scheduledAt: '2026-10-30T12:00', itemIds: [], sentAt: null, opens: null },
    ],
    products: [
      { id: 'pr1', name: '会社四季報オンライン プレミアム', category: 'サブスク', url: 'https://example.com/aff/shikiho', price: 5500, personaIds: ['p1'], clicks: 1240, conversions: 38, active: true },
      { id: 'pr2', name: '可変式ダンベル 24kg', category: 'フィットネス', url: 'https://example.com/aff/dumbbell', price: 12800, personaIds: ['p2'], clicks: 1860, conversions: 71, active: true },
      { id: 'pr3', name: 'ミールキット お試しセット', category: '食品', url: 'https://example.com/aff/mealkit', price: 1980, personaIds: ['p3', 'p4'], clicks: 2104, conversions: 95, active: true },
      { id: 'pr4', name: '家計簿アプリ プレミアム', category: 'アプリ', url: 'https://example.com/aff/kakeibo', price: 480, personaIds: ['p4'], clicks: 1530, conversions: 42, active: true },
      { id: 'pr5', name: 'ワーケーション施設予約', category: 'サービス', url: 'https://example.com/aff/workation', price: 0, personaIds: ['p5'], clicks: 690, conversions: 27, active: true },
      { id: 'pr6', name: 'プロテイン 3kg', category: '食品', url: 'https://example.com/aff/protein', price: 6980, personaIds: ['p2'], clicks: 410, conversions: 9, active: false },
    ],
    notion: {
      connected: true,
      workspace: 'Persona Wire HQ',
      token: 'secret_8fK2…x9Qa',
      lastSync: '2026-10-26T09:40:00+09:00',
      syncing: false,
      autoSync: true,
      interval: 30,
      databases: [
        { key: 'items', label: '収集記事', dbName: 'articles / sns_posts', direction: 'both', enabled: true },
        { key: 'scores', label: '適合度スコア', dbName: 'article_persona_scores', direction: 'push', enabled: true },
        { key: 'personas', label: 'ペルソナ', dbName: 'personas', direction: 'both', enabled: true },
        { key: 'issues', label: '配信号', dbName: 'newsletter_issues', direction: 'push', enabled: true },
        { key: 'products', label: '商品・リンク', dbName: 'affiliate_links', direction: 'pull', enabled: false },
      ],
      mapping: [
        { field: 'タイトル', prop: 'Name', type: 'title' },
        { field: 'ソース', prop: 'Source', type: 'select' },
        { field: 'カテゴリ', prop: 'Category', type: 'select' },
        { field: '主担当ペルソナ', prop: 'Persona', type: 'relation' },
        { field: 'ステータス', prop: 'Status', type: 'status' },
        { field: '編集コメント', prop: 'Editor Note', type: 'rich_text' },
        { field: 'URL', prop: 'Link', type: 'url' },
      ],
      logs: [
        { at: '2026-10-26T09:40:00+09:00', ok: true, text: '同期完了：articles +6 / sns_posts +8、article_persona_scores +70' },
        { at: '2026-10-26T09:10:00+09:00', ok: true, text: '同期完了：articles +2' },
        { at: '2026-10-26T08:40:00+09:00', ok: false, text: 'レート制限 (429) のため 60 秒後に再試行しました' },
        { at: '2026-10-26T08:10:00+09:00', ok: true, text: '同期完了：personas 更新 1' },
      ],
    },
    site: { title: 'Persona Wire', domain: 'persona-wire.example.com' },
  };
}

function loadLocal(): LocalState {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as LocalState) : seedLocal();
  } catch {
    return seedLocal();
  }
}

// DB の分は reload() で読み込むまで空
let state: AppState = { ...loadLocal(), personas: [], items: [], activity: [], runs: [] };
state.notion.syncing = false;

function save(): void {
  const { personas: _p, items: _i, activity: _a, runs: _r, ...local } = state;
  try {
    localStorage.setItem(KEY, JSON.stringify(local));
  } catch {
    /* 保存できなくても動作は継続 */
  }
}

/** サンプルの p1〜p5 を、同じコード（P01〜P05）の DB のペルソナに付け替える。消えた記事は配信号から外す */
function relink(): void {
  const resolve = (id: PersonaId): PersonaId => {
    const m = /^p(\d+)$/.exec(id);
    return (m && state.personas.find((p) => p.code === 'P' + m[1].padStart(2, '0'))?.id) || id;
  };
  for (const d of state.deliveries) d.persona = resolve(d.persona);
  for (const pr of state.products) pr.personaIds = pr.personaIds.map(resolve);
  const ids = new Set(state.items.map((i) => i.id));
  for (const x of state.issues) x.itemIds = x.itemIds.filter((id) => ids.has(id));
}

const notify = (): void => listeners.forEach((l) => l());

export const store = {
  get state(): AppState {
    return state;
  },
  judge: (item: Pick<Item, 'scores'>) => judgeWith(item, state.personas),
  update(fn: (s: AppState) => void): void {
    fn(state);
    save();
    notify();
  },
  subscribe(fn: () => void): void {
    listeners.push(fn);
  },
  /** DB からペルソナ・記事・操作ログを読み直す */
  async reload(): Promise<void> {
    const { personas, items, activity, runs } = await db.loadAll();
    state.personas = personas;
    // AI 判定が空でもスコアがある記事（Table Editor で入れた記事など）は、スコアから判定して表示する（DB には書かない）。
    // スコアが無い記事（バッチで取り込んだ直後）は、判定待ちのまま
    state.items = items.map((it) => {
      if (it.verdict || !hasScores(it)) return it;
      const j = judgeWith(it, personas);
      return { ...it, verdict: j.verdict, persona: it.persona ?? j.persona };
    });
    state.activity = activity;
    state.runs = runs;
    relink();
    save();
    notify();
  },
  /**
   * DB への書き込みを待つ。失敗したら（権限がない場合など）エラーを出し、DB の内容で画面を戻す。
   * 画面は先に update() で書き換えておき、その後でこれを呼ぶ。
   */
  async commit(task: Promise<unknown>, okMessage?: string): Promise<boolean> {
    try {
      await task;
      if (okMessage) ui.toast(okMessage);
      return true;
    } catch (e) {
      ui.toast('保存できませんでした: ' + dbMessage(e), 'warn');
      await store.reload().catch(() => {});
      return false;
    }
  },
  /** 開発用: 有料配信・商品・Notion のサンプルを初期状態に戻す（DB の分は読み直す） */
  async reset(): Promise<void> {
    state = { ...seedLocal(), personas: state.personas, items: state.items, activity: state.activity, runs: state.runs };
    await store.reload();
  },
  /** 操作ログを残す。画面にはすぐ出し、DB には後ろで書き込む */
  log(text: string, action = 'note'): void {
    state.activity.unshift({ at: new Date().toISOString(), text, who: auth.member?.name ?? '' });
    state.activity = state.activity.slice(0, 30);
    db.insertLog(text, action).catch((e) => console.error('操作ログを保存できませんでした', e));
  },
  persona: (id: PersonaId | null | undefined): Persona | undefined => state.personas.find((p) => p.id === id),
  delivery: (id: string | null | undefined): Delivery | undefined => state.deliveries.find((d) => d.id === id),
  item: (id: string | null | undefined): Item | undefined => state.items.find((i) => i.id === id),
  /**
   * 記事の状態を変える。update() の中で呼ぶ。
   * 配信に使えない状態（要確認・却下）にしたら未配信の配信号から外し、外した号を返す。配信済みの号は記録として残す。
   * 予約済みの号が空になったら、下書きに戻す。
   */
  setItemStatus(it: Item, to: ItemStatus): Issue[] {
    it.status = to;
    it.updatedAt = new Date().toISOString(); // DB 側でも更新日時が今になる（却下からの自動削除の起点）
    if (isUsable(to)) return [];
    const touched = state.issues.filter((x) => x.status !== 'sent' && x.itemIds.includes(it.id));
    for (const x of touched) {
      x.itemIds = x.itemIds.filter((id) => id !== it.id);
      if (!x.itemIds.length && x.status === 'scheduled') x.status = 'draft';
    }
    return touched;
  },
};

// 開発用: コンソールから PW.store.reload() などを呼べるようにする
declare global {
  interface Window {
    PW?: { store: typeof store };
  }
}
window.PW = { store };
