-- クリック数を正しい値にする
--   1. 同じ人・同じ商品のクリックは、1 日（日本時間）に 1 回だけ数える。
--      人の見分けには、公開サイトが作る visitor を使う（IP アドレス・ブラウザの種類・日付・合言葉から作るハッシュ。
--      元の IP アドレスには戻せず、日が変わると別の値になる）
--   2. record_click は、公開サイトだけが知っている合言葉（app_secrets の click_token）が無いと記録しない。
--      公開用の鍵で外から直接呼んでも、数は増えない（転送先は今までどおり返す）
--   3. 管理画面用に、記事ごと・日ごとのクリック数のビューを足す
--
-- 実行のあと:
--   - 次の SQL で合言葉を表示し、公開サイト 2 つの Worker に Secret として入れる（site/README.md の「クリックの合言葉」）
--       select value from public.app_secrets where name = 'click_token';
--   - 入れるまで、公開サイトのクリックは数えない（転送は動く）
--   - これまでの記録（visitor が空）は、重複を含んだまま残る。数え直したいときは消す:
--       delete from public.link_clicks where visitor is null;

-- ========== 1 日 1 回 ==========
alter table public.link_clicks
  add column visitor   text check (visitor ~ '^[0-9a-f]{64}$'),
  add column click_day date;
update public.link_clicks set click_day = (created_at at time zone 'Asia/Tokyo')::date;
alter table public.link_clicks
  alter column click_day set default ((now() at time zone 'Asia/Tokyo')::date),
  alter column click_day set not null;

create unique index link_clicks_once_a_day on public.link_clicks (product_id, visitor, click_day) where visitor is not null;
create index link_clicks_day_idx on public.link_clicks (click_day);

-- ========== 合言葉 ==========
-- 権限ルールだけ付けてポリシーは作らないので、画面や公開用の鍵からは読めない（下の関数と SQL Editor だけが読む）
create table public.app_secrets (
  name   text primary key,
  value  text not null
);
alter table public.app_secrets enable row level security;
revoke all on public.app_secrets from anon, authenticated;

insert into public.app_secrets (name, value)
values ('click_token', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''));

-- ========== クリックの記録 ==========
drop function public.record_click(uuid, text, bigint, text, text);

create function public.record_click(
  product uuid, placement text, article_no bigint default null, persona_handle text default null,
  site text default null, visitor text default null, token text default null
)
returns text
language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  dest text;
  sid uuid;
begin
  -- 引数と同じ名前の列（visitor）があるので、SQL の中では列を優先し、引数は record_click.visitor と書く
  select pp.url, s.id into dest, sid
  from public.public_products pp
  join public.sites s on s.code = pp.site_code
  where pp.id = product and (site is null or pp.site_code = site)
  order by pp.site_code
  limit 1;
  if dest is null then
    return null;
  end if;
  -- 合言葉が合わない呼び出し（公開サイト以外から）、visitor が無いもの（ロボット・自分たちのクリック）は数えない
  if visitor is null or token is null
     or not exists (select 1 from public.app_secrets where name = 'click_token' and value = token) then
    return dest;
  end if;
  insert into public.link_clicks (product_id, article_id, persona_id, placement, site_id, visitor)
  values (
    product,
    (select id from public.articles where no = article_no and status = 'published'),
    (select id from public.personas where handle = persona_handle and active),
    case when placement in ('side', 'article', 'email') then placement else 'other' end,
    sid,
    record_click.visitor
  )
  on conflict (product_id, visitor, click_day) where visitor is not null do nothing;
  return dest;
end;
$$;

revoke execute on function public.record_click(uuid, text, bigint, text, text, text, text) from public;
grant execute on function public.record_click(uuid, text, bigint, text, text, text, text) to anon, authenticated, service_role;

-- ========== 管理画面用の集計（呼んだ人の権限で動くので、メンバー以外には 0 行） ==========
-- 記事ごとのクリック数（記事ページの商品枠で押されたもの）
create view public.article_click_counts with (security_invoker = true) as
  select article_id,
         count(*) filter (where created_at >= now() - interval '30 days')::int as clicks_30d,
         count(*)::int as clicks_total
  from public.link_clicks
  where article_id is not null
  group by article_id;

-- 日ごとのクリック数（日本時間、直近 90 日）
create view public.daily_click_counts with (security_invoker = true) as
  select click_day as day, count(*)::int as clicks
  from public.link_clicks
  where click_day > (now() at time zone 'Asia/Tokyo')::date - 90
  group by click_day;

revoke all on public.article_click_counts, public.daily_click_counts from anon;
grant select on public.article_click_counts, public.daily_click_counts to authenticated;
