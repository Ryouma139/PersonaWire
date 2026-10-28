-- 要約が空の記事（Notion から取り込んだニュースなど）に、元記事のページの概要（og:description など）を入れる。
-- 収集バッチ（collector/）が 1 回の実行で少しずつ取りに行き、この関数でまとめて書き込む

-- 概要の取得を試した日時。取れなかった記事に何度も取りに行かないための印
alter table public.articles add column excerpt_checked_at timestamptz;

-- items: [{"id": "<記事の id>", "excerpt": "<概要。取れなければ空>"}]。書き込んだ件数を返す
create function public.set_article_excerpts(items jsonb) returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  n integer;
begin
  update public.articles a
  set excerpt = case when x.excerpt <> '' then x.excerpt else a.excerpt end,
      excerpt_checked_at = now()
  from jsonb_to_recordset(items) as x(id uuid, excerpt text)
  where a.id = x.id and a.excerpt = '';
  get diagnostics n = row_count;
  return n;
end;
$$;

-- 呼べるのは収集バッチ（service_role）だけ
revoke execute on function public.set_article_excerpts(jsonb) from public, anon, authenticated;
grant execute on function public.set_article_excerpts(jsonb) to service_role;

-- 実行履歴に、概要を取りに行った件数と、取れた件数を残す
alter table public.collect_runs add column excerpt_tried integer not null default 0;
alter table public.collect_runs add column excerpt_filled integer not null default 0;
