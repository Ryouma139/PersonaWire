/* Persona Wire — Supabase の表との読み書き（ペルソナ・記事・スコア・操作ログ） */
import { supabase } from './auth';
import type { Activity, CollectRun, Item, ItemStatus, NotionDbName, Persona, PersonaId, SourceKind, Verdict } from './types';

interface PersonaRow {
  id: string;
  code: string;
  name: string;
  handle: string;
  color: string;
  description: string;
  keywords: string[];
  ng_words: string[];
  tone: string;
  threshold: number;
  active: boolean;
}

interface ArticleRow {
  id: string;
  no: number;
  source_id: string | null;
  created_at: string;
  type: 'news' | 'sns';
  kind: SourceKind;
  source_name: string;
  category: string;
  title: string;
  excerpt: string;
  url: string;
  collected_at: string;
  status: ItemStatus;
  primary_persona_id: string | null;
  verdict: Verdict | null;
  editor_comment: string;
  notion_db: NotionDbName;
  article_persona_scores: Array<{ persona_id: string; relevance_score: number; reasons: string[] }>;
}

interface RunRow {
  started_at: string;
  finished_at: string | null;
  trigger: 'cron' | 'manual';
  ok: boolean | null;
  inserted: number;
  skipped: number;
  message: string;
}

const toRun = (r: RunRow): CollectRun => ({
  startedAt: r.started_at, finishedAt: r.finished_at, trigger: r.trigger, ok: r.ok, inserted: r.inserted, skipped: r.skipped, message: r.message,
});

interface LogRow {
  created_at: string;
  action: string;
  detail: { text?: string };
  actor: 'user' | 'system';
  users: { name: string } | null;
}

/** 画面から追加・編集できる記事の項目 */
export type ArticleFields = Pick<Item, 'kind' | 'source' | 'category' | 'title' | 'excerpt' | 'url'>;

const NOTION_DB: Record<SourceKind, NotionDbName> = { NEWS: 'articles', YOUTUBE: 'sns_posts', NOTE: 'sns_posts', X: 'sns_posts', THREADS: 'sns_posts' };

function fromFields(a: Partial<ArticleFields>): Partial<ArticleRow> {
  const row: Partial<ArticleRow> = {};
  if (a.kind !== undefined) { row.kind = a.kind; row.type = a.kind === 'NEWS' ? 'news' : 'sns'; }
  if (a.source !== undefined) row.source_name = a.source;
  if (a.category !== undefined) row.category = a.category;
  if (a.title !== undefined) row.title = a.title;
  if (a.excerpt !== undefined) row.excerpt = a.excerpt;
  if (a.url !== undefined) row.url = a.url;
  return row;
}

const toPersona = (r: PersonaRow): Persona => ({
  id: r.id, code: r.code, name: r.name, handle: r.handle, color: r.color, description: r.description,
  keywords: r.keywords, ngWords: r.ng_words, tone: r.tone, threshold: r.threshold, active: r.active,
});

const fromPersona = (p: Omit<Persona, 'id'>): Omit<PersonaRow, 'id'> => ({
  code: p.code, name: p.name, handle: p.handle, color: p.color, description: p.description,
  keywords: p.keywords, ng_words: p.ngWords, tone: p.tone, threshold: p.threshold, active: p.active,
});

function toItem(r: ArticleRow): Item {
  const scores: Record<PersonaId, number> = {};
  const reasons: Record<PersonaId, string[]> = {};
  for (const s of r.article_persona_scores) {
    scores[s.persona_id] = s.relevance_score;
    if (s.reasons.length) reasons[s.persona_id] = s.reasons;
  }
  return {
    id: r.id, no: r.no, type: r.type, kind: r.kind, source: r.source_name, category: r.category, title: r.title,
    excerpt: r.excerpt, url: r.url, comment: r.editor_comment, notionDb: r.notion_db, status: r.status,
    collectedAt: r.collected_at, fetchedAt: r.created_at, sourceId: r.source_id, verdict: r.verdict, persona: r.primary_persona_id, scores, reasons,
  };
}

const toActivity = (r: LogRow): Activity => ({
  at: r.created_at,
  text: r.detail.text ?? r.action,
  who: r.actor === 'system' ? 'システム' : r.users?.name ?? '',
});

/** 権限ルールで拒否された更新は、エラーではなく「0 行」で返ってくるので、ここでエラーにする */
function changed<T>(data: T[] | null): T[] {
  if (!data || !data.length) throw new Error('権限がないか、対象が見つかりません');
  return data;
}

/** Supabase のエラーを、画面に出す日本語にする */
export function dbMessage(e: unknown): string {
  const raw = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String(e.message) : String(e);
  if (/row-level security/i.test(raw)) return '権限がありません';
  if (/duplicate key.*url/i.test(raw)) return 'その URL の記事はすでにあります';
  if (/articles_url_check/i.test(raw)) return 'URL は http:// か https:// で始めてください';
  if (/duplicate key.*code/i.test(raw)) return 'そのコードは使われています';
  if (/duplicate key.*handle/i.test(raw)) return 'そのスラッグは使われています';
  if (/personas_color_check/i.test(raw)) return 'カラーの形式が正しくありません';
  return raw;
}

export const db = {
  async loadAll(): Promise<{ personas: Persona[]; items: Item[]; activity: Activity[]; runs: CollectRun[] }> {
    const [p, a, l, r] = await Promise.all([
      supabase.from('personas').select('*').order('code'),
      supabase.from('articles').select('*, article_persona_scores(persona_id, relevance_score, reasons)').order('collected_at', { ascending: false }),
      supabase.from('activity_logs').select('created_at, action, detail, actor, users(name)').order('created_at', { ascending: false }).limit(30),
      supabase.from('collect_runs').select('started_at, finished_at, trigger, ok, inserted, skipped, message').order('started_at', { ascending: false }).limit(10),
    ]);
    if (p.error) throw p.error;
    if (a.error) throw a.error;
    if (l.error) throw l.error;
    if (r.error) throw r.error;
    return {
      personas: (p.data as PersonaRow[]).map(toPersona),
      items: (a.data as ArticleRow[]).map(toItem),
      activity: (l.data as unknown as LogRow[]).map(toActivity),
      runs: (r.data as RunRow[]).map(toRun),
    };
  },

  /** 収集バッチを今すぐ動かす。ログイン中の人の証明書を渡し、バッチ側で承認済みメンバーかを確かめる */
  async runCollector(): Promise<{ inserted: number; message: string }> {
    const base = import.meta.env.VITE_COLLECTOR_URL;
    if (!base) throw new Error('ts/.env.local に VITE_COLLECTOR_URL を書いてください');
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error('ログインし直してください');
    const res = await fetch(`${base.replace(/\/$/, '')}/run`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    const body = (await res.json().catch(() => ({}))) as { inserted?: number; message?: string; error?: string };
    if (res.status === 401) throw new Error('収集を実行する権限がありません');
    if (!res.ok) throw new Error(body.error ?? `収集バッチがエラーを返しました（${res.status}）`);
    return { inserted: body.inserted ?? 0, message: body.message ?? '' };
  },

  /** 記事を追加する（状態は要確認）。追加した記事の id を返す */
  async insertArticle(a: ArticleFields & { verdict: Verdict; persona: PersonaId | null }): Promise<string> {
    const { data, error } = await supabase.from('articles').insert({
      ...fromFields(a), verdict: a.verdict, primary_persona_id: a.persona, notion_db: NOTION_DB[a.kind],
    }).select('id');
    if (error) throw error;
    return changed(data)[0].id as string;
  },

  async deleteArticle(id: string): Promise<void> {
    const { data, error } = await supabase.from('articles').delete().eq('id', id).select('id');
    if (error) throw error;
    changed(data);
  },

  /** ペルソナごとのスコアと判定理由を保存する（あれば上書き）。手入力なので model は manual */
  async saveScores(articleId: string, scores: Record<PersonaId, number>, reasons: Record<PersonaId, string[]>): Promise<void> {
    const rows = Object.entries(scores).map(([personaId, score]) => ({
      article_id: articleId, persona_id: personaId, relevance_score: score, reasons: reasons[personaId] ?? [], model: 'manual', judged_at: new Date().toISOString(),
    }));
    if (!rows.length) return;
    const { error } = await supabase.from('article_persona_scores').upsert(rows);
    if (error) throw error;
  },

  async updateArticle(id: string, patch: Partial<ArticleFields> & { status?: ItemStatus; persona?: PersonaId | null; notionDb?: NotionDbName; comment?: string; verdict?: Verdict | null }): Promise<void> {
    const row: Partial<ArticleRow> = fromFields(patch);
    if (patch.status !== undefined) row.status = patch.status;
    if (patch.persona !== undefined) row.primary_persona_id = patch.persona;
    if (patch.notionDb !== undefined) row.notion_db = patch.notionDb;
    if (patch.comment !== undefined) row.editor_comment = patch.comment;
    if (patch.verdict !== undefined) row.verdict = patch.verdict;
    const { data, error } = await supabase.from('articles').update(row).eq('id', id).select('id');
    if (error) throw error;
    changed(data);
  },

  async insertPersona(p: Omit<Persona, 'id'>): Promise<Persona> {
    const { data, error } = await supabase.from('personas').insert(fromPersona(p)).select('*');
    if (error) throw error;
    return toPersona(changed(data as PersonaRow[])[0]);
  },

  async updatePersona(p: Persona): Promise<void> {
    const { data, error } = await supabase.from('personas').update(fromPersona(p)).eq('id', p.id).select('id');
    if (error) throw error;
    changed(data);
  },

  async deletePersona(id: string): Promise<void> {
    const { data, error } = await supabase.from('personas').delete().eq('id', id).select('id');
    if (error) throw error;
    changed(data);
  },

  async insertLog(text: string, action: string): Promise<void> {
    const { error } = await supabase.from('activity_logs').insert({ action, detail: { text } });
    if (error) throw error;
  },
};
