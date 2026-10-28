/* 収集バッチ: 収集先を読み、安全確認・除外・重複除去・1 日の上限を通して articles に登録する */
import { safeUrl, type Candidate, type Source } from './candidate';
import { notionCandidates } from './notion';
import { rssCandidates } from './rss';
import { inList, rest, type Env, type Rest } from './supabase';

type NotionDbName = 'articles' | 'sns_posts';

interface PersonaRow {
  id: string;
  code: string;
  ng_words: string[];
  active: boolean;
}

interface SourceReport {
  name: string;
  read: number;
  inserted: number;
  error?: string;
}

export interface Summary {
  ok: boolean;
  inserted: number;
  skipped: number;
  /** 今日（日本時間）すでにバッチで登録した件数と、上限 */
  usedToday: number;
  limit: number;
  sources: SourceReport[];
  message: string;
}

/** 日本時間の今日 0 時（UTC の ISO 形式） */
function jstMidnight(now = Date.now()): string {
  const jst = new Date(now + 9 * 3600e3);
  return new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate()) - 9 * 3600e3).toISOString();
}

/** すでに articles にある URL（40 件ずつ問い合わせる） */
async function existingUrls(db: Rest, urls: string[]): Promise<Set<string>> {
  const found = new Set<string>();
  for (let i = 0; i < urls.length; i += 40) {
    const chunk = urls.slice(i, i + 40);
    const rows = await db.select<{ url: string }>(`articles?select=url&url=${encodeURIComponent(inList(chunk))}`);
    for (const r of rows) found.add(r.url);
  }
  return found;
}

async function read(env: Env, source: Source): Promise<Candidate[]> {
  if (source.method === 'notion') return notionCandidates(env.NOTION_TOKEN, source);
  if (source.method === 'rss') return rssCandidates(source);
  throw new Error(`取得方法 ${source.method} にはまだ対応していません`);
}

export async function collect(env: Env, trigger: 'cron' | 'manual'): Promise<Summary> {
  const db = rest(env);
  const [run] = await db.insert<{ id: number }>('collect_runs', { trigger }, { select: 'id' });
  const limit = Number(env.DAILY_LIMIT ?? 100);
  const summary: Summary = { ok: true, inserted: 0, skipped: 0, usedToday: 0, limit, sources: [], message: '' };

  try {
    summary.usedToday = await db.count(`articles?select=id&source_id=not.is.null&created_at=gte.${encodeURIComponent(jstMidnight())}`);
    const personas = await db.select<PersonaRow>('personas?select=id,code,ng_words,active');
    const sources = await db.select<Source>('sources?select=id,kind,method,name,target,options&active=eq.true');
    const personaId = new Map(personas.map((p) => [p.code, p.id]));
    // 有効なペルソナ全員の NG ワードに入っている語は、どのペルソナにも使わないので取り込まない
    const active = personas.filter((p) => p.active);
    const globalNg = active.length ? active[0].ng_words.filter((w) => active.every((p) => p.ng_words.includes(w))) : [];

    // 収集先ごとに読む。1 つが失敗しても、ほかは続ける
    const pool: Array<{ c: Candidate; source: Source }> = [];
    for (const source of sources) {
      const report: SourceReport = { name: source.name, read: 0, inserted: 0 };
      summary.sources.push(report);
      try {
        const got = await read(env, source);
        report.read = got.length;
        for (const c of got) pool.push({ c, source });
      } catch (e) {
        report.error = e instanceof Error ? e.message : String(e);
        summary.ok = false;
      }
    }

    // 安全確認（H6）・除外・同じ回の中での重複を除く
    const seen = new Set<string>();
    const valid = pool.filter(({ c, source }) => {
      const url = safeUrl(c.url);
      const excluded = source.options.exclude_categories?.includes(c.category) || globalNg.some((w) => c.title.includes(w));
      if (!url || !c.title || excluded || seen.has(url)) return false;
      c.url = url;
      seen.add(url);
      return true;
    });

    // 新しい記事から順に、1 日の上限まで登録する。上限で漏れた記事は、次の日以降の実行で拾う
    const exists = await existingUrls(db, valid.map(({ c }) => c.url));
    const fresh = valid.filter(({ c }) => !exists.has(c.url)).sort((a, b) => b.c.collectedAt.localeCompare(a.c.collectedAt));
    const room = Math.max(0, limit - summary.usedToday);
    const take = fresh.slice(0, room);
    summary.skipped = pool.length - take.length;

    if (take.length) {
      const rows = take.map(({ c, source }) => ({
        source_id: source.id,
        type: c.kind === 'NEWS' ? 'news' : 'sns',
        kind: c.kind,
        source_name: c.sourceName.slice(0, 200),
        category: c.category,
        title: c.title.slice(0, 500),
        excerpt: c.excerpt,
        url: c.url,
        collected_at: c.collectedAt,
        status: 'pending',
        // AI 判定までの仮の主担当（カテゴリ → ペルソナの対応の先頭）
        primary_persona_id: personaId.get(source.options.category_personas?.[c.category]?.[0] ?? '') ?? null,
        notion_db: (c.kind === 'NEWS' ? 'articles' : 'sns_posts') satisfies NotionDbName,
      }));
      const inserted = await db.insert<{ url: string }>('articles', rows, { select: 'url', onConflict: 'url', ignoreDuplicates: true });
      summary.inserted = inserted.length;
      summary.skipped += take.length - inserted.length;
      const bySource = new Map(take.map(({ c, source }) => [c.url, source.name]));
      for (const r of inserted) {
        const report = summary.sources.find((s) => s.name === bySource.get(r.url));
        if (report) report.inserted++;
      }
    }

    // 読めた収集先は、最終取得日時を更新する
    const okIds = sources.filter((s) => !summary.sources.find((r) => r.name === s.name)?.error).map((s) => s.id);
    if (okIds.length) await db.update(`sources?id=${encodeURIComponent(inList(okIds))}`, { last_fetched_at: new Date().toISOString() });

    const full = room <= take.length && fresh.length > take.length ? `（1日の上限 ${limit} 件に達したため ${fresh.length - take.length} 件は翌日以降）` : '';
    summary.message = `${summary.inserted} 件を登録${full}`;
    if (summary.inserted) {
      await db.insert('activity_logs', { actor: 'system', user_id: null, action: 'collect.run', detail: { text: `収集バッチで ${summary.inserted} 件を取り込み${full}` } });
    }
  } catch (e) {
    summary.ok = false;
    summary.message = e instanceof Error ? e.message : String(e);
  }

  const errors = summary.sources.filter((s) => s.error).map((s) => `${s.name}: ${s.error}`);
  await db.update(`collect_runs?id=eq.${run.id}`, {
    finished_at: new Date().toISOString(),
    ok: summary.ok,
    inserted: summary.inserted,
    skipped: summary.skipped,
    message: [summary.message, ...errors].filter(Boolean).join(' / ').slice(0, 2000),
    detail: { sources: summary.sources, usedToday: summary.usedToday, limit },
  });
  return summary;
}
