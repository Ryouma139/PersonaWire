/* Persona Wire — Supabase の表との読み書き（ペルソナ・記事・スコア・操作ログ） */
import { supabase } from './auth';
import type { Activity, Item, ItemStatus, NotionDbName, Persona, PersonaId, SourceKind, Verdict } from './types';

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

interface LogRow {
  created_at: string;
  action: string;
  detail: { text?: string };
  actor: 'user' | 'system';
  users: { name: string } | null;
}

/** 記事の verdict が空（手で追加した記事など）のときは、画面側で判定して埋める */
export type LoadedItem = Omit<Item, 'verdict'> & { verdict: Verdict | null };

const toPersona = (r: PersonaRow): Persona => ({
  id: r.id, code: r.code, name: r.name, handle: r.handle, color: r.color, description: r.description,
  keywords: r.keywords, ngWords: r.ng_words, tone: r.tone, threshold: r.threshold, active: r.active,
});

const fromPersona = (p: Omit<Persona, 'id'>): Omit<PersonaRow, 'id'> => ({
  code: p.code, name: p.name, handle: p.handle, color: p.color, description: p.description,
  keywords: p.keywords, ng_words: p.ngWords, tone: p.tone, threshold: p.threshold, active: p.active,
});

function toItem(r: ArticleRow): LoadedItem {
  const scores: Record<PersonaId, number> = {};
  const reasons: Record<PersonaId, string[]> = {};
  for (const s of r.article_persona_scores) {
    scores[s.persona_id] = s.relevance_score;
    if (s.reasons.length) reasons[s.persona_id] = s.reasons;
  }
  return {
    id: r.id, no: r.no, type: r.type, kind: r.kind, source: r.source_name, category: r.category, title: r.title,
    excerpt: r.excerpt, url: r.url, comment: r.editor_comment, notionDb: r.notion_db, status: r.status,
    collectedAt: r.collected_at, verdict: r.verdict, persona: r.primary_persona_id, scores, reasons,
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
  if (/duplicate key.*code/i.test(raw)) return 'そのコードは使われています';
  if (/duplicate key.*handle/i.test(raw)) return 'そのスラッグは使われています';
  if (/personas_color_check/i.test(raw)) return 'カラーの形式が正しくありません';
  return raw;
}

export const db = {
  async loadAll(): Promise<{ personas: Persona[]; items: LoadedItem[]; activity: Activity[] }> {
    const [p, a, l] = await Promise.all([
      supabase.from('personas').select('*').order('code'),
      supabase.from('articles').select('*, article_persona_scores(persona_id, relevance_score, reasons)').order('collected_at', { ascending: false }),
      supabase.from('activity_logs').select('created_at, action, detail, actor, users(name)').order('created_at', { ascending: false }).limit(30),
    ]);
    if (p.error) throw p.error;
    if (a.error) throw a.error;
    if (l.error) throw l.error;
    return {
      personas: (p.data as PersonaRow[]).map(toPersona),
      items: (a.data as ArticleRow[]).map(toItem),
      activity: (l.data as unknown as LogRow[]).map(toActivity),
    };
  },

  async updateArticle(id: string, patch: { status?: ItemStatus; persona?: PersonaId | null; notionDb?: NotionDbName; comment?: string; verdict?: Verdict }): Promise<void> {
    const row: Partial<ArticleRow> = {};
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
