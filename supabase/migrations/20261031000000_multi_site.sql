-- 公開サイトを複数持てるようにする（1 つ目: Persona Wire（日本語）、2 つ目: 海外の旅行者向け（英語。site_adoutor/）など）
--
--   - sites: サイトごとの設定（名前・言語・URL・運営者情報）。公開サイトの Worker は自分のコード（SITE_CODE）で読む
--   - site_personas: サイトで扱うペルソナ。記事は、主担当ペルソナが入っているサイトに出る
--   - product_links: 商品のサイトごとのアフィリエイトリンク。ASP の登録はサイト（媒体）ごとで、リンクに入る ID がサイトごとに違うため。
--     リンクが無いサイトには、その商品を出さない
--   - link_clicks.site_id: どのサイトで押されたか
--
-- 今ある公開サイト（site/）と管理画面は、このあと各サイトの絞り込みに対応するまで、今のまま動くようにしている
--   - 公開用のビューは、今の列をそのまま残し、最後に site_code を足す（絞り込まなければ今と同じ結果）
--   - products.url は残し、Persona Wire 用のリンク（product_links）に自動で写す（管理画面がサイトごとのリンクに対応したら外す）
--   - record_click は今の呼び方のまま使える（site を渡さなければ、その商品のリンクのうち 1 つを使う）
-- 注意: 2 つ目のサイトのペルソナ（P06〜）は、公開サイトがサイトで絞り込むようになってから登録する。
--       それまでは、今の公開サイトに出てしまう

-- ========== サイト ==========
create table public.sites (
  id                 uuid primary key default gen_random_uuid(),
  code               text not null unique check (code ~ '^[a-z0-9_-]{2,30}$'),  -- Worker の SITE_CODE と同じ値
  name               text not null,
  tagline            text not null default '',
  locale             text not null default 'ja' check (locale in ('ja', 'en')),  -- 画面の文言の言語
  url                text not null default '' check (url = '' or url ~ '^https://'),  -- 公開 URL（末尾の / なし）
  operator_name      text not null default '',
  operator_site_url  text not null default '' check (operator_site_url = '' or operator_site_url ~ '^https://'),
  operator_x_url     text not null default '' check (operator_x_url = '' or operator_x_url ~ '^https://'),
  contact_url        text not null default '' check (contact_url = '' or contact_url ~ '^(https://|mailto:)'),
  active             boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create trigger sites_touch before update on public.sites
  for each row execute function public.touch_updated_at();

-- サイトで扱うペルソナ（1 つのペルソナを複数のサイトで扱ってもよい）
create table public.site_personas (
  site_id     uuid not null references public.sites (id) on delete cascade,
  persona_id  uuid not null references public.personas (id) on delete cascade,
  primary key (site_id, persona_id)
);
create index site_personas_persona_idx on public.site_personas (persona_id);

-- 商品のサイトごとのアフィリエイトリンク
create table public.product_links (
  product_id  uuid not null references public.products (id) on delete cascade,
  site_id     uuid not null references public.sites (id) on delete cascade,
  url         text not null check (url ~ '^https://'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (product_id, site_id)
);
create index product_links_site_idx on public.product_links (site_id);

create trigger product_links_touch before update on public.product_links
  for each row execute function public.touch_updated_at();

-- どのサイトで押されたか（サイトを消しても、クリックの記録は残す）
alter table public.link_clicks add column site_id uuid references public.sites (id) on delete set null;
create index link_clicks_site_idx on public.link_clicks (site_id, created_at desc);

-- ========== 今のデータを 1 つ目のサイト（Persona Wire）に移す ==========
insert into public.sites (code, name, tagline, locale, url, operator_name, operator_site_url, operator_x_url, contact_url)
values ('persona-wire', 'Persona Wire', 'あなたのためのニュースを、編集者が厳選。', 'ja',
        'https://persona-wire-site.tryoma0227.workers.dev',
        'R（ITフリーランサー23歳）', 'https://product-adree.vercel.app/', 'https://x.com/YpKwCSPTK7KxNUk',
        'https://docs.google.com/forms/d/e/1FAIpQLSfJuivVzfoc9t5PFSmXATH5QF-ATAMFejvvxRVN4OHk8HR1-g/viewform');

insert into public.site_personas (site_id, persona_id)
select s.id, p.id from public.sites s cross join public.personas p where s.code = 'persona-wire';

insert into public.product_links (product_id, site_id, url)
select pr.id, s.id, pr.url from public.products pr cross join public.sites s where s.code = 'persona-wire';

update public.link_clicks set site_id = (select id from public.sites where code = 'persona-wire');

-- 管理画面がサイトごとのリンクに対応するまでの仮: products.url を Persona Wire 用のリンクに写す
create function public.products_sync_default_link() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.product_links (product_id, site_id, url)
  select new.id, s.id, new.url from public.sites s where s.code = 'persona-wire'
  on conflict (product_id, site_id) do update set url = excluded.url;
  return new;
end;
$$;

create trigger products_sync_default_link after insert or update of url on public.products
  for each row execute function public.products_sync_default_link();

-- ========== 権限（管理画面） ==========
alter table public.sites         enable row level security;
alter table public.site_personas enable row level security;
alter table public.product_links enable row level security;

-- サイト・サイトのペルソナ: 読むのはメンバー、変えるのは管理者
create policy sites_select on public.sites for select to authenticated using (public.is_member());
create policy sites_write  on public.sites for all    to authenticated using (public.is_admin()) with check (public.is_admin());

create policy site_personas_select on public.site_personas for select to authenticated using (public.is_member());
create policy site_personas_write  on public.site_personas for all    to authenticated using (public.is_admin()) with check (public.is_admin());

-- 商品のリンク: 商品と同じく、変えるのは管理者だけ（差し替えられると、収益が他人に流れるため）
create policy product_links_select on public.product_links for select to authenticated using (public.is_member());
create policy product_links_write  on public.product_links for all    to authenticated using (public.is_admin()) with check (public.is_admin());

-- ========== 公開サイト用の読み取り口（anon） ==========
-- 今の列はそのまま、最後に site_code を足す。公開サイトは site_code=eq.<自分のコード> で絞り込む
drop view public.public_article_products;
drop view public.public_products;
drop view public.public_articles;
drop view public.public_personas;

-- 有効なサイトの設定
create view public.public_sites as
  select code, name, tagline, locale, url, operator_name, operator_site_url, operator_x_url, contact_url
  from public.sites
  where active;

-- 有効なペルソナ。サイトごとに 1 行（どのサイトにも入っていないペルソナは、site_code が空の 1 行）
create view public.public_personas as
  select p.code, p.name, p.handle, p.color, p.description, s.code as site_code
  from public.personas p
  left join public.site_personas sp on sp.persona_id = p.id
  left join public.sites s on s.id = sp.site_id and s.active
  where p.active;

-- 公開中の記事。主担当ペルソナが入っているサイトごとに 1 行（主担当が無い記事は、site_code が空の 1 行）
create view public.public_articles as
  select a.no, a.kind, a.source_name, a.category, a.title, a.excerpt, a.url, a.editor_comment,
         a.collected_at, a.published_at,
         p.handle as persona_handle, p.code as persona_code, p.name as persona_name, p.color as persona_color,
         s.code as site_code
  from public.articles a
  left join public.personas p on p.id = a.primary_persona_id and p.active
  left join public.site_personas sp on sp.persona_id = p.id
  left join public.sites s on s.id = sp.site_id and s.active
  where a.status = 'published';

-- 掲載中の商品。リンクのあるサイトごとに 1 行。url はそのサイト用のリンク。社内メモと成果の数字は出さない
create view public.public_products as
  select pr.id, pr.name, pr.category, pr.asp, pl.url, pr.image_url, pr.price,
         coalesce((select array_agg(pe.handle order by pe.code)
                   from public.product_personas pp join public.personas pe on pe.id = pp.persona_id and pe.active
                   where pp.product_id = pr.id), '{}') as persona_handles,
         s.code as site_code
  from public.products pr
  join public.product_links pl on pl.product_id = pr.id
  join public.sites s on s.id = pl.site_id and s.active
  where pr.active
    and (pr.starts_at is null or pr.starts_at <= now())
    and (pr.ends_at is null or pr.ends_at > now());

-- 記事ページの関連商品（公開中の記事 × そのサイトで掲載中の商品）
create view public.public_article_products as
  select a.no as article_no, ap.product_id, pp.site_code
  from public.article_products ap
  join public.articles a on a.id = ap.article_id and a.status = 'published'
  join public.public_products pp on pp.id = ap.product_id;

grant select on public.public_sites, public.public_personas, public.public_articles, public.public_products, public.public_article_products to anon, authenticated;

-- ========== クリックの記録（site を追加） ==========
-- site: 押されたサイトのコード。省略すると、その商品のリンクのうち 1 つを使う（今の公開サイトからの呼び方）
drop function public.record_click(uuid, text, bigint, text);

create function public.record_click(product uuid, placement text, article_no bigint default null, persona_handle text default null, site text default null)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  dest text;
  sid uuid;
begin
  select pp.url, s.id into dest, sid
  from public.public_products pp
  join public.sites s on s.code = pp.site_code
  where pp.id = product and (site is null or pp.site_code = site)
  order by pp.site_code
  limit 1;
  if dest is null then
    return null;
  end if;
  insert into public.link_clicks (product_id, article_id, persona_id, placement, site_id)
  values (
    product,
    (select id from public.articles where no = article_no and status = 'published'),
    (select id from public.personas where handle = persona_handle and active),
    case when placement in ('side', 'article', 'email') then placement else 'other' end,
    sid
  );
  return dest;
end;
$$;

revoke execute on function public.record_click(uuid, text, bigint, text, text) from public;
grant execute on function public.record_click(uuid, text, bigint, text, text) to anon, authenticated, service_role;
