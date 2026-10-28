-- 却下した記事を、最後の更新（却下した操作を含む）から 5 日たったら削除する。収集バッチ（collector/）が 2 時間ごとに呼ぶ
--   - 削除した記事の URL は purged_urls に残し、収集バッチが同じ記事を取り込み直さないようにする
--   - 記事のスコア（article_persona_scores）は、記事と一緒に消える（on delete cascade）

create table public.purged_urls (
  url        text primary key,
  purged_at  timestamptz not null default now()
);

alter table public.purged_urls enable row level security;
-- 読むのはメンバー。書くのは下の関数（収集バッチ）だけ
create policy purged_urls_select on public.purged_urls for select to authenticated using (public.is_member());

-- 削除した件数を返す。days 日より前に更新された「却下」の記事が対象
create function public.purge_rejected_articles(days integer default 5) returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  n integer;
begin
  with gone as (
    delete from public.articles
    where status = 'rejected' and updated_at < now() - make_interval(days => days)
    returning url
  )
  insert into public.purged_urls (url)
  select url from gone
  on conflict (url) do update set purged_at = now();
  get diagnostics n = row_count;
  return n;
end;
$$;

-- 呼べるのは収集バッチ（service_role）だけ。画面（anon・authenticated）からは呼べない
revoke execute on function public.purge_rejected_articles(integer) from public, anon, authenticated;
grant execute on function public.purge_rejected_articles(integer) to service_role;

-- 収集の実行履歴に、削除した件数を残す
alter table public.collect_runs add column purged integer not null default 0;
