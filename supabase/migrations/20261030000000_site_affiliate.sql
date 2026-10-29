-- 公開サイトとアフィリエイト: 商品、商品と記事・ペルソナの紐づけ、クリックの記録、公開サイト用の読み取り口
--
-- 公開サイト（site/）は誰でも読める鍵（Publishable key = anon）で読む。
-- anon には表を直接読ませず、公開してよい列と行だけを出す public_* ビューと、クリックを記録する関数だけを開ける。
-- （ビューは作成者の権限で動くので、元の表の RLS を通らずに「公開中の記事」「有効な商品」だけを返せる）
--
-- 注意点として、次もここで守る
--   - 記事の公開には、編集コメント（20 字以上）が必要。元記事の転載ではなく、こちらのコメントを主にするため
--   - クリックの記録には IP アドレスなどの個人を特定できる情報を残さない

-- ========== 商品 ==========
create table public.products (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  category     text not null default '',
  asp          text not null check (asp in ('amazon', 'rakuten', 'a8', 'moshimo', 'other')),
  url          text not null check (url ~ '^https://'),            -- ASP が発行したアフィリエイトリンク
  image_url    text check (image_url is null or image_url ~ '^https://'),
  price        integer not null default 0 check (price >= 0),
  note         text not null default '',                           -- 社内メモ（公開しない）
  active       boolean not null default true,
  starts_at    timestamptz,                                         -- 掲載期間（空 = 制限なし）
  ends_at      timestamptz,
  conversions  integer not null default 0 check (conversions >= 0), -- 成果。ASP の管理画面を見て手で入れる（累計）
  revenue      integer not null default 0 check (revenue >= 0),     -- 報酬額（円、累計）
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger products_touch before update on public.products
  for each row execute function public.touch_updated_at();

-- 商品を出すペルソナ（公開サイトのおすすめ枠）
create table public.product_personas (
  product_id  uuid not null references public.products (id) on delete cascade,
  persona_id  uuid not null references public.personas (id) on delete cascade,
  primary key (product_id, persona_id)
);

-- 記事ごとに手で選んだ関連商品（記事ページに出す）
create table public.article_products (
  article_id  uuid not null references public.articles (id) on delete cascade,
  product_id  uuid not null references public.products (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (article_id, product_id)
);

-- ========== クリックの記録 ==========
-- 誰が押したかは残さない（IP・Cookie・端末の情報は保存しない）。どの商品が、どのページのどの枠で押されたかだけ
create table public.link_clicks (
  id          bigint generated always as identity primary key,
  product_id  uuid not null references public.products (id) on delete cascade,
  article_id  uuid references public.articles (id) on delete set null,
  persona_id  uuid references public.personas (id) on delete set null,
  placement   text not null check (placement in ('side', 'article', 'email', 'other')),
  created_at  timestamptz not null default now()
);
create index link_clicks_product_idx on public.link_clicks (product_id, created_at desc);

-- 商品ごとのクリック数（管理画面用。呼んだ人の権限で動くので、メンバー以外には 0 行）
create view public.product_click_counts with (security_invoker = true) as
  select product_id,
         count(*) filter (where created_at >= now() - interval '30 days')::int as clicks_30d,
         count(*)::int as clicks_total
  from public.link_clicks
  group by product_id;

-- ========== 権限（管理画面） ==========
alter table public.products         enable row level security;
alter table public.product_personas enable row level security;
alter table public.article_products enable row level security;
alter table public.link_clicks      enable row level security;

-- 商品: 読むのはメンバー、変えるのは管理者（リンク先を差し替えられると、収益が他人に流れるため）
create policy products_select on public.products for select to authenticated using (public.is_member());
create policy products_write  on public.products for all    to authenticated using (public.is_admin()) with check (public.is_admin());

create policy product_personas_select on public.product_personas for select to authenticated using (public.is_member());
create policy product_personas_write  on public.product_personas for all    to authenticated using (public.is_admin()) with check (public.is_admin());

-- 記事と商品の紐づけ: メンバーが記事を編集するときに選べる
create policy article_products_select on public.article_products for select to authenticated using (public.is_member());
create policy article_products_write  on public.article_products for all    to authenticated using (public.is_member()) with check (public.is_member());

-- クリック: メンバーは読むだけ。書き込みは下の record_click() からだけ
create policy link_clicks_select on public.link_clicks for select to authenticated using (public.is_member());

-- ========== 公開には編集コメントが必要 ==========
-- 公開中にするとき・公開中のままコメントを短くするときに、20 字以上あるかを確かめる（自動処理も含めて全員）
create or replace function public.articles_before_update() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if (new.status = 'published') <> (old.status = 'published')
     and auth.uid() is not null and not public.is_admin() then
    raise exception '公開・非公開の切り替えは管理者だけができます' using errcode = '42501';
  end if;
  if new.status = 'published' and char_length(btrim(new.editor_comment)) < 20 then
    raise exception '公開するには、編集コメントを 20 字以上書いてください' using errcode = '23514';
  end if;
  if new.status = 'published' and old.status <> 'published' then
    new.published_at := now();
  elsif new.status <> 'published' then
    new.published_at := null;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- ========== 公開サイト用の読み取り口（anon） ==========
-- 公開してよいペルソナの項目だけ（NG ワード・しきい値などの内部の設定は出さない）
create view public.public_personas as
  select code, name, handle, color, description
  from public.personas
  where active;

-- 公開中の記事。元記事の本文は持っていないので、タイトル・要約・編集コメント・元記事へのリンクだけ
create view public.public_articles as
  select a.no, a.kind, a.source_name, a.category, a.title, a.excerpt, a.url, a.editor_comment,
         a.collected_at, a.published_at,
         p.handle as persona_handle, p.code as persona_code, p.name as persona_name, p.color as persona_color
  from public.articles a
  left join public.personas p on p.id = a.primary_persona_id and p.active
  where a.status = 'published';

-- 掲載中の商品。社内メモと成果の数字は出さない
create view public.public_products as
  select pr.id, pr.name, pr.category, pr.asp, pr.url, pr.image_url, pr.price,
         coalesce(array_agg(pe.handle) filter (where pe.handle is not null), '{}') as persona_handles
  from public.products pr
  left join public.product_personas pp on pp.product_id = pr.id
  left join public.personas pe on pe.id = pp.persona_id and pe.active
  where pr.active
    and (pr.starts_at is null or pr.starts_at <= now())
    and (pr.ends_at is null or pr.ends_at > now())
  group by pr.id;

-- 記事ページの関連商品（掲載中のものだけ）
create view public.public_article_products as
  select a.no as article_no, ap.product_id
  from public.article_products ap
  join public.articles a on a.id = ap.article_id and a.status = 'published'
  join public.public_products pp on pp.id = ap.product_id;

grant select on public.public_personas, public.public_articles, public.public_products, public.public_article_products to anon, authenticated;

-- クリックを 1 件記録し、転送先（アフィリエイトリンク）を返す。掲載中でない商品なら NULL（記録もしない）
--   article_no: 記事ページから押されたときの記事番号、persona_handle: ペルソナのページから押されたとき
create function public.record_click(product uuid, placement text, article_no bigint default null, persona_handle text default null)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  dest text;
begin
  select url into dest from public.public_products where id = product;
  if dest is null then
    return null;
  end if;
  insert into public.link_clicks (product_id, article_id, persona_id, placement)
  values (
    product,
    (select id from public.articles where no = article_no and status = 'published'),
    (select id from public.personas where handle = persona_handle and active),
    case when placement in ('side', 'article', 'email') then placement else 'other' end
  );
  return dest;
end;
$$;

revoke execute on function public.record_click(uuid, text, bigint, text) from public;
grant execute on function public.record_click(uuid, text, bigint, text) to anon, authenticated, service_role;
