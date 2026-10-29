/* 収集バッチ: 収集先を読み、安全確認・除外・重複除去・1 日の上限を通して articles に登録する */
import { safeUrl, type Candidate, type Source } from './candidate';
import { Budget, RESERVED_FOR_FINISH } from './budget';
import { fillExcerpts } from './excerpt';
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
  /** 却下から日数がたったので削除した記事数 */
  purged: number;
  /** 要約が空の記事に、元記事の概要を取りに行った件数と、取れた件数 */
  excerptTried: number;
  excerptFilled: number;
  /** この実行で外部に通信した回数（実行履歴の更新を含む） */
  subrequests: number;
  sources: SourceReport[];
  message: string;
}

/** 日本時間の今日 0 時（UTC の ISO 形式） */
function jstMidnight(now = Date.now()): string {
  const jst = new Date(now + 9 * 3600e3);
  return new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate()) - 9 * 3600e3).toISOString();
}

/** すでに articles にある URL と、却下して削除した記事の URL（purged_urls）。40 件ずつ問い合わせる */
async function existingUrls(db: Rest, urls: string[]): Promise<Set<string>> {
  const found = new Set<string>();
  for (let i = 0; i < urls.length; i += 40) {
    const q = `select=url&url=${encodeURIComponent(inList(urls.slice(i, i + 40)))}`;
    const [live, purged] = await Promise.all([db.select<{ url: string }>(`articles?${q}`), db.select<{ url: string }>(`purged_urls?${q}`)]);
    for (const r of [...live, ...purged]) found.add(r.url);
  }
  return found;
}

async function read(env: Env, source: Source, budget: Budget): Promise<Candidate[]> {
  let got: Candidate[];
  if (source.method === 'notion') got = await notionCandidates(budget.fetch, env.NOTION_TOKEN, source);
  else if (source.method === 'rss') got = await rssCandidates(source, budget.fetch);
  else throw new Error(`取得方法 ${source.method} にはまだ対応していません`);
  // max_items があれば、新しいものからその数だけにする
  const max = source.options.max_items;
  return max && max > 0 ? got.sort((a, b) => b.collectedAt.localeCompare(a.collectedAt)).slice(0, max) : got;
}

/** 1 回の実行で外部に通信できる回数（Workers の無料プランは 50） */
export const subrequestLimit = (env: Env): number => Number(env.SUBREQUEST_LIMIT ?? 50);

/** budget: この実行の通信の回数。手動実行では、権限の確認で使った分も含めて渡す */
export async function collect(env: Env, trigger: 'cron' | 'manual', budget = new Budget(subrequestLimit(env))): Promise<Summary> {
  const db = rest(env, budget.fetch);
  const [run] = await db.insert<{ id: number }>('collect_runs', { trigger }, { select: 'id' });
  const limit = Number(env.DAILY_LIMIT ?? 100);
  const summary: Summary = { ok: true, inserted: 0, skipped: 0, usedToday: 0, limit, purged: 0, excerptTried: 0, excerptFilled: 0, subrequests: 0, sources: [], message: '' };

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
        const got = await read(env, source, budget);
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
    // 収集先ごとの 1 日の上限（daily_max）。今日すでに登録した数から数え始める
    const capped = sources.filter((s) => s.options.daily_max !== undefined);
    const usedBySource = new Map<string, number>();
    if (capped.length) {
      const today = await db.select<{ source_id: string }>(
        `articles?select=source_id&source_id=${encodeURIComponent(inList(capped.map((s) => s.id)))}&created_at=gte.${encodeURIComponent(jstMidnight())}`);
      for (const r of today) usedBySource.set(r.source_id, (usedBySource.get(r.source_id) ?? 0) + 1);
    }
    const overCap = new Map<string, number>(); // 収集先の上限で翌日以降に回した数
    const take: typeof fresh = [];
    for (const x of fresh) {
      if (take.length >= room) break;
      const max = x.source.options.daily_max;
      const used = usedBySource.get(x.source.id) ?? 0;
      if (max !== undefined && used >= max) {
        overCap.set(x.source.name, (overCap.get(x.source.name) ?? 0) + 1);
        continue;
      }
      usedBySource.set(x.source.id, used + 1);
      take.push(x);
    }
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

    const capNote = [...overCap].map(([name, n]) => `${name} は1日の上限に達したため ${n} 件`).join('、');
    const left = fresh.length - take.length - [...overCap.values()].reduce((a, n) => a + n, 0);
    const full = [
      room <= take.length && left > 0 ? `1日の上限 ${limit} 件に達したため ${left} 件` : '',
      capNote,
    ].filter(Boolean).join('、');
    const fullNote = full ? `（${full}は翌日以降）` : '';
    summary.message = `${summary.inserted} 件を登録${fullNote}`;
    if (summary.inserted) {
      await db.insert('activity_logs', { actor: 'system', user_id: null, action: 'collect.run', detail: { text: `収集バッチで ${summary.inserted} 件を取り込み${fullNote}` } });
    }
  } catch (e) {
    summary.ok = false;
    summary.message = e instanceof Error ? e.message : String(e);
  }

  // 要約が空の記事に、元記事の概要を入れる（新しい記事から）。収集が失敗しても行う。
  // 件数は EXCERPT_LIMIT まで。ただし通信の残りから、対象の読み込みと書き込み（2 回）と、最後の処理の分を引いた数を超えない
  try {
    const room = Math.min(Number(env.EXCERPT_LIMIT ?? 5), budget.left - 2 - RESERVED_FOR_FINISH);
    const r = await fillExcerpts(db, room, budget.fetch);
    summary.excerptTried = r.tried;
    summary.excerptFilled = r.filled;
    if (r.tried) summary.message += `、概要 ${r.filled}/${r.tried} 件を取得`;
  } catch (e) {
    summary.message += ` / 概要の取得に失敗: ${e instanceof Error ? e.message : String(e)}`;
  }

  // 却下して日数がたった記事を削除する。収集が失敗しても行う
  const days = Number(env.PURGE_REJECTED_DAYS ?? 5);
  try {
    summary.purged = await db.rpc<number>('purge_rejected_articles', { days });
    if (summary.purged) {
      summary.message += `、却下から ${days} 日たった ${summary.purged} 件を削除`;
      await db.insert('activity_logs', { actor: 'system', user_id: null, action: 'article.purge', detail: { text: `却下から ${days} 日たった記事 ${summary.purged} 件を削除` } });
    }
  } catch (e) {
    summary.ok = false;
    summary.message += ` / 却下した記事の削除に失敗: ${e instanceof Error ? e.message : String(e)}`;
  }

  summary.subrequests = budget.used + 1; // この下の実行履歴の更新の 1 回を含める
  const errors = summary.sources.filter((s) => s.error).map((s) => `${s.name}: ${s.error}`);
  await db.update(`collect_runs?id=eq.${run.id}`, {
    finished_at: new Date().toISOString(),
    ok: summary.ok,
    inserted: summary.inserted,
    skipped: summary.skipped,
    purged: summary.purged,
    excerpt_tried: summary.excerptTried,
    excerpt_filled: summary.excerptFilled,
    message: [summary.message, ...errors].filter(Boolean).join(' / ').slice(0, 2000),
    detail: { sources: summary.sources, usedToday: summary.usedToday, limit, subrequests: budget.used + 1, subrequestLimit: budget.limit },
  });
  return summary;
}
