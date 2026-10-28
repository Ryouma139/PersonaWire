-- Persona Wire 第2段階（H3）: 収集バッチ（collector/、Cloudflare Workers）のための変更
--   - sources: 取得方法に notion を追加。種別は空でもよい（Notion は記事ごとに URL から判定する）。設定欄 options を追加
--   - collect_runs: バッチの実行履歴
--   - Notion の news_link を収集先として登録する

-- ========== 収集先 ==========
alter table public.sources alter column kind drop not null;
alter table public.sources drop constraint sources_method_check;
alter table public.sources add constraint sources_method_check check (method in ('rss', 'api', 'search', 'notion'));

-- 収集先ごとの設定。例（Notion）:
--   lookback_days      何日前までの日付ページを読むか（取りこぼし防止。重複は URL で除く）
--   exclude_categories 取り込まないカテゴリ
--   category_personas  カテゴリ → 主担当ペルソナのコード（AI 判定までの仮の主担当）
alter table public.sources add column options jsonb not null default '{}';

-- ========== 実行履歴 ==========
create table public.collect_runs (
  id           bigint generated always as identity primary key,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  trigger      text not null check (trigger in ('cron', 'manual')),
  ok           boolean,
  inserted     integer not null default 0,   -- 登録した記事数
  skipped      integer not null default 0,   -- 重複・除外・上限で登録しなかった数
  message      text not null default '',
  detail       jsonb not null default '{}'   -- 収集先ごとの内訳とエラー
);
create index collect_runs_started_idx on public.collect_runs (started_at desc);

alter table public.collect_runs enable row level security;
-- 読むのはメンバー。書くのはバッチ（service_role。RLS の対象外）だけ
create policy collect_runs_select on public.collect_runs for select to authenticated using (public.is_member());

-- ========== 収集先の登録 ==========
-- kind が空の行は一意制約で重複を防げないため、not exists で確認する
insert into public.sources (kind, method, name, target, options)
select null, 'notion', 'Notion news_link', '3aa2e8c9228c8179bf52e9b3d7e7a7e6',
  '{
    "lookback_days": 3,
    "exclude_categories": ["芸能・文化"],
    "category_personas": {
      "テクノロジー": ["P01"], "経済": ["P01"], "企業": ["P01"],
      "ライフスタイル": ["P02", "P04"],
      "政策": ["P03", "P05"], "社会": ["P03", "P05"]
    }
  }'::jsonb
where not exists (select 1 from public.sources where method = 'notion' and target = '3aa2e8c9228c8179bf52e9b3d7e7a7e6');
