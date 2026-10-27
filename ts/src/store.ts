/* Persona Wire — データストア（モックデータ + localStorage 永続化） */
import type { AppState, Delivery, Item, Persona, PersonaId, SourceKind, NotionDbName, Verdict } from './types';

const KEY = 'persona-wire:v2';
const listeners: Array<() => void> = [];

export const uid = (p: string): string => p + Math.random().toString(36).slice(2, 9);
const PIDS: PersonaId[] = ['p1', 'p2', 'p3', 'p4', 'p5'];
const toScores = (arr: number[]): Record<PersonaId, number> => Object.fromEntries(PIDS.map((id, i) => [id, arr[i] ?? 0]));

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

interface ItemTemplate {
  kind: SourceKind;
  source: string;
  category: string;
  title: string;
  excerpt: string;
  /** P01〜P05 の順のスコア */
  s: number[];
  reasons: Record<PersonaId, string[]>;
}

// kind: 表示用のソース種別 / type: news | sns（絞り込み用）
const ITEM_POOL: ItemTemplate[] = [
  { kind: 'NEWS', source: 'サンプル生活新聞', category: 'ライフ', title: '月1万円以内で始める筋トレ食生活', excerpt: '鶏むね肉・卵・豆腐を軸に、1食300円以内で必要なタンパク質を確保する献立例を紹介。', s: [42, 87, 12, 71, 4], reasons: { p2: ['筋トレ初心者向け', '低予算の食事を扱う', '自宅で実践できる'], p4: ['節約・生活改善に直結', '一人暮らしの食事'] } },
  { kind: 'YOUTUBE', source: 'サンプル暮らしCH', category: 'ライフ', title: '仕事帰りの90分を有効活用する方法', excerpt: '帰宅後のだらだら時間を減らすための、着替え・夕食・入浴の順番の工夫。', s: [38, 36, 6, 88, 3], reasons: { p4: ['仕事後の時間術', '日常改善の具体策'] } },
  { kind: 'NOTE', source: 'sample_saving', category: 'マネー', title: '手取り20万円台の一人暮らし、固定費を月1.5万円減らした記録', excerpt: '通信費・サブスク・電気代の見直しで、無理なく固定費を削った手順を公開。', s: [12, 25, 22, 93, 6], reasons: { p4: ['一人暮らしの家計', '再現性の高い節約'] } },
  { kind: 'NEWS', source: 'テック経済ニュース', category: 'テック', title: '国内AIスタートアップ、シリーズBで80億円調達', excerpt: '生成AI向け推論チップを手がける国内スタートアップが資金調達を発表。2027年の量産開始を目指す。', s: [94, 5, 8, 22, 15], reasons: { p1: ['資金調達の一次情報', 'AIインフラ領域'] } },
  { kind: 'X', source: '@semicon_watch', category: 'テック', title: 'TSMC熊本第2工場、稼働前倒しの観測', excerpt: '関係者筋によると第2工場の稼働時期が前倒しになる可能性。周辺自治体では住宅需要も高まっている。', s: [82, 4, 6, 10, 64], reasons: { p1: ['半導体サプライチェーン'], p5: ['地方の雇用増'] } },
  { kind: 'NEWS', source: 'サンプル社会新聞', category: '子育て', title: '「こども誰でも通園制度」来年度から本格実施へ', excerpt: '就労要件を問わず保育所を利用できる制度が全国で本格実施。月の利用上限時間も見直される見通し。', s: [5, 8, 96, 14, 20], reasons: { p3: ['保育制度の変更', '対象・時期が明確'] } },
  { kind: 'THREADS', source: '@mama_engineer', category: '子育て', title: '時短勤務でも回る、共働き家庭の1日のスケジュール', excerpt: '朝5時起きのルーティンと、夫婦の家事分担表を公開します。', s: [8, 20, 84, 40, 12], reasons: { p3: ['共働きの実例', '時短の工夫'] } },
  { kind: 'NEWS', source: '地域経済ニュース', category: '地域', title: '地方のサテライトオフィス補助金、上限1億円に拡充', excerpt: '地方創生テレワーク交付金の上限額が引き上げられ、空き家改修にも適用可能に。', s: [20, 4, 10, 18, 92], reasons: { p5: ['補助金の具体額', 'リモートワーク'] } },
  { kind: 'NOTE', source: '移住3年目のデザイナー', category: '地域', title: '人口3,000人の町に移住して分かったリアルな収支', excerpt: '家賃は都内の1/4。ただし車の維持費と冬の暖房費は想定以上でした。', s: [10, 22, 12, 48, 86], reasons: { p5: ['移住の実体験', '数値付き'] } },
  { kind: 'YOUTUBE', source: '宅トレ部', category: 'ヘルス', title: '器具なし15分、自宅でできる全身サーキット', excerpt: '腕立て・スクワット・プランクを組み合わせた初心者向けメニュー。', s: [3, 91, 30, 52, 8], reasons: { p2: ['自宅トレーニング', '初心者向け'] } },
  { kind: 'X', source: '@celeb_news_jp', category: 'エンタメ', title: '人気俳優が結婚を発表', excerpt: '自身のSNSで結婚を報告。', s: [2, 3, 10, 6, 2], reasons: {} },
  { kind: 'NEWS', source: 'テック経済ニュース', category: 'テック', title: '米半導体大手の決算、データセンター売上が前年比2.1倍', excerpt: 'AI需要の拡大を背景にガイダンスを上方修正。時間外取引で株価は8%上昇した。', s: [91, 2, 3, 8, 5], reasons: { p1: ['決算速報', '市場影響が大きい'] } },
  { kind: 'THREADS', source: '@hitori_kurashi', category: 'ライフ', title: '休日に誰とも話さない日をなくす、小さな習慣', excerpt: '近所の店で一言交わす、オンラインもくもく会に出るなど、無理のない工夫。', s: [4, 18, 6, 82, 30], reasons: { p4: ['孤独感への対処', '小さく始められる'] } },
  { kind: 'NEWS', source: 'サンプル生活新聞', category: 'ライフ', title: '業務スーパーで揃う高タンパク食材ベスト10', excerpt: '100gあたりの価格とタンパク質量で比較したランキング。', s: [2, 85, 28, 60, 6], reasons: { p2: ['高タンパク・低価格'], p4: ['自炊の節約'] } },
];

const NOTION_DB: Record<SourceKind, NotionDbName> = { NEWS: 'articles', YOUTUBE: 'sns_posts', NOTE: 'sns_posts', X: 'sns_posts', THREADS: 'sns_posts' };

type ItemExtra = Pick<Item, 'id' | 'no' | 'scores' | 'status' | 'collectedAt'>;

function fromTemplate(t: ItemTemplate, extra: ItemExtra, personas: Persona[]): Item {
  const base = {
    type: t.kind === 'NEWS' ? 'news' : 'sns',
    kind: t.kind,
    source: t.source,
    category: t.category,
    title: t.title,
    excerpt: t.excerpt,
    reasons: t.reasons,
    notionDb: NOTION_DB[t.kind],
    url: 'https://example.com/article/' + Math.floor(Math.random() * 9000 + 1000),
    comment: '',
    ...extra,
  } as const;
  return { ...base, ...judgeWith(base, personas) };
}

function seed(): AppState {
  const personas: Persona[] = [
    { id: 'p1', code: 'P01', name: 'テック × 投資 × 情報収集', handle: 'tech-invest', color: '#6f95d6', description: 'AI・半導体・資金調達の動きを、投資判断の材料として追う会社員。', keywords: ['AI', '半導体', '資金調達', '決算'], ngWords: ['芸能'], tone: '簡潔・データ重視', threshold: 75, active: true },
    { id: 'p2', code: 'P02', name: '筋トレ × 節約 × 自炊', handle: 'fit-saving', color: '#5cc489', description: 'お金をかけずに体づくりをしたい20代。自宅トレと安い高タンパク食に関心。', keywords: ['筋トレ', '自炊', '節約', 'タンパク質'], ngWords: ['芸能', 'サプリ広告'], tone: '前向き・実践的', threshold: 70, active: true },
    { id: 'p3', code: 'P03', name: '子育て × 共働き × 時短', handle: 'family-time', color: '#9d84dc', description: '共働きで未就学児を育てる30代。制度変更と時短の工夫を求める。', keywords: ['保育', '育休', '時短', '家事分担'], ngWords: ['芸能', '炎上'], tone: 'やさしく実用的', threshold: 70, active: true },
    { id: 'p4', code: 'P04', name: '仕事 × 孤独 × 日常改善', handle: 'solo-life', color: '#e9ad62', description: '一人暮らしの会社員。仕事後の時間と家計、ひとりの過ごし方を少しずつ良くしたい。', keywords: ['一人暮らし', '節約', '習慣', '時間術'], ngWords: ['芸能'], tone: '静かで寄り添う', threshold: 80, active: true },
    { id: 'p5', code: 'P05', name: '地方 × 移住 × リモート', handle: 'local-remote', color: '#dc6d88', description: 'リモートワークで地方移住を検討・実践している人。', keywords: ['移住', '地方創生', 'リモートワーク', '補助金'], ngWords: ['芸能'], tone: 'フラット・体験重視', threshold: 70, active: true },
  ];

  // サンプル記事の収集時刻は「いま」から遡って並べる
  const base = Math.floor((Date.now() - 12 * 6e4) / 6e4) * 6e4;
  const statuses: Item['status'][] = ['pending', 'published', 'pending', 'published', 'pending', 'published', 'approved', 'pending', 'approved', 'pending', 'rejected', 'pending', 'pending', 'approved'];
  const items = ITEM_POOL.map((t, i) => {
    const it = fromTemplate(t, { id: 'i' + (i + 1), no: 1024 - i, scores: toScores(t.s), status: statuses[i], collectedAt: new Date(base - i * 1000 * 60 * 83).toISOString() }, personas);
    if (it.status === 'published') it.comment = (Object.values(it.reasons)[0] ?? ['注目の話題'])[0] + 'という点で、いま読む価値のある記事です。';
    return it;
  });

  return {
    personas,
    items,
    deliveries: [
      { id: 'd1', name: 'Tech Investor Weekly', persona: 'p1', price: 980, channel: 'メール', cadence: '毎週月曜 7:00', subscribers: 312, openRate: 64, status: 'active' },
      { id: 'd2', name: 'ひとり暮らし改善レター', persona: 'p4', price: 500, channel: 'LINE', cadence: '毎週水・土 20:00', subscribers: 528, openRate: 71, status: 'active' },
      { id: 'd3', name: '節約筋トレ通信', persona: 'p2', price: 380, channel: 'メール', cadence: '毎週金曜 12:00', subscribers: 204, openRate: 66, status: 'active' },
      { id: 'd4', name: 'ローカル移住ノート', persona: 'p5', price: 680, channel: 'メール', cadence: '隔週金曜 12:00', subscribers: 146, openRate: 58, status: 'paused' },
    ],
    issues: [
      { id: 'is1', deliveryId: 'd1', no: 42, title: 'AI推論チップに80億円、半導体決算の読み方', intro: '今週はAIインフラ関連の大型ニュースが続きました。', status: 'draft', scheduledAt: '2026-11-02T07:00', itemIds: ['i4', 'i12'], sentAt: null, opens: null },
      { id: 'is2', deliveryId: 'd1', no: 41, title: '熊本の半導体投資、次の焦点', intro: '', status: 'sent', scheduledAt: '2026-10-26T07:00', itemIds: ['i5'], sentAt: '2026-10-26T07:00', opens: 201 },
      { id: 'is3', deliveryId: 'd2', no: 88, title: '固定費を月1.5万円減らす', intro: '今週は家計と、仕事終わりの時間の使い方を特集します。', status: 'scheduled', scheduledAt: '2026-10-28T20:00', itemIds: ['i3', 'i2', 'i13'], sentAt: null, opens: null },
      { id: 'is4', deliveryId: 'd3', no: 15, title: '1食300円の高タンパク献立', intro: '', status: 'draft', scheduledAt: '2026-10-30T12:00', itemIds: ['i1', 'i14'], sentAt: null, opens: null },
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
    daily: [
      { d: '10/21', news: 38, sns: 52, adopted: 19 },
      { d: '10/22', news: 41, sns: 47, adopted: 22 },
      { d: '10/23', news: 35, sns: 61, adopted: 18 },
      { d: '10/24', news: 44, sns: 58, adopted: 25 },
      { d: '10/25', news: 29, sns: 40, adopted: 14 },
      { d: '10/26', news: 33, sns: 49, adopted: 20 },
      { d: '10/27', news: 0, sns: 0, adopted: 0 },
    ],
    activity: [
      { at: '2026-10-26T20:00:00+09:00', text: '「ひとり暮らし改善レター」#88 を予約しました' },
      { at: '2026-10-26T09:40:00+09:00', text: 'Notion と同期しました' },
      { at: '2026-10-26T08:55:00+09:00', text: 'AIが 14 件を判定（採用候補 9 件）' },
      { at: '2026-10-26T07:00:00+09:00', text: '「Tech Investor Weekly」#41 を配信（開封 201）' },
    ],
    site: { title: 'Persona Wire', domain: 'persona-wire.example.com' },
  };
}

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as AppState) : seed();
  } catch {
    return seed();
  }
}

let state = load();
state.notion.syncing = false;

function save(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* 保存できなくても動作は継続 */
  }
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
  reset(): void {
    state = seed();
    save();
    notify();
  },
  log(text: string): void {
    state.activity.unshift({ at: new Date().toISOString(), text });
    state.activity = state.activity.slice(0, 30);
  },
  persona: (id: PersonaId | null | undefined): Persona | undefined => state.personas.find((p) => p.id === id),
  delivery: (id: string | null | undefined): Delivery | undefined => state.deliveries.find((d) => d.id === id),
  item: (id: string | null | undefined): Item | undefined => state.items.find((i) => i.id === id),
  // 収集シミュレーション: プールから新しいアイテムを生成
  collect(n: number): Item[] {
    const added: Item[] = [];
    let no = state.items.reduce((m, i) => Math.max(m, i.no || 0), 1000);
    for (let k = 0; k < n; k++) {
      const t = ITEM_POOL[Math.floor(Math.random() * ITEM_POOL.length)];
      const base = toScores(t.s);
      const scores: Record<PersonaId, number> = {};
      for (const p of state.personas) {
        const b = base[p.id] ?? Math.floor(Math.random() * 40);
        scores[p.id] = Math.max(0, Math.min(100, b + Math.round((Math.random() - 0.5) * 16)));
      }
      added.push(fromTemplate(t, { id: uid('i'), no: ++no, scores, status: 'pending', collectedAt: new Date().toISOString() }, state.personas));
    }
    return added;
  },
};

// 開発用: コンソールから PW.store.reset() などを呼べるようにする
declare global {
  interface Window {
    PW?: { store: typeof store };
  }
}
window.PW = { store };
