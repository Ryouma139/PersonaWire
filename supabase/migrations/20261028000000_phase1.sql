-- Persona Wire 第1段階（H1・H2）: ユーザー、操作ログ、ペルソナ、収集先、記事、適合度スコア
-- 元にした定義: docs/DB.md 6章。Supabase 向けに次を変えている。
--   - users.id は Supabase Auth のユーザー（auth.users）と同じ ID。ログインしたときに自動で行を作る
--   - users.role が空（NULL）の人は「未承認」。管理者が role を付けるまで、何も読めない・書けない
--   - 収集先（sources）を追加し、articles.source_id でつなぐ（docs/OVERVIEW.md 5章）
--   - 権限は RLS（行単位のアクセス制御）と、articles の更新前トリガーで守る
-- 収集・判定などの自動処理は、サーバーから service_role で実行する前提（RLS の対象外。auth.uid() は NULL）

-- ========== 共通 ==========
create table public.users (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null unique,
  name        text not null,
  role        text check (role in ('admin', 'editor')),  -- NULL = 未承認
  created_at  timestamptz not null default now()
);

-- ログインした人の役割。未ログイン・未承認なら NULL
create function public.app_role() returns text
language sql stable security definer set search_path = ''
as $$
  select role from public.users where id = auth.uid()
$$;

create function public.is_member() returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(public.app_role() in ('admin', 'editor'), false)
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(public.app_role() = 'admin', false)
$$;

-- 初めてログインした人の行を作る（役割は空 = 未承認）
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.users (id, email, name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', new.email));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create table public.activity_logs (
  id           bigint generated always as identity primary key,
  actor        text not null default 'user' check (actor in ('user', 'system')),  -- system = 収集・判定などの自動処理
  user_id      uuid default auth.uid() references public.users (id) on delete set null,
  action       text not null,              -- 例: article.publish, issue.send
  target_type  text,
  target_id    text,
  detail       jsonb not null default '{}',
  created_at   timestamptz not null default now(),
  check (actor = 'system' or user_id is not null)
);
create index activity_logs_created_idx on public.activity_logs (created_at desc);

-- ========== ペルソナ ==========
create table public.personas (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique,       -- 表示用 P01
  name         text not null,
  handle       text not null unique,       -- 公開URLのスラッグ
  color        text not null default '#888888' check (color ~ '^#[0-9a-fA-F]{6}$'),
  description  text not null default '',
  keywords     text[] not null default '{}',
  ng_words     text[] not null default '{}',
  tone         text not null default '',
  threshold    smallint not null default 70 check (threshold between 0 and 100),
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ========== 収集先 ==========
create table public.sources (
  id               uuid primary key default gen_random_uuid(),
  kind             text not null check (kind in ('NEWS', 'YOUTUBE', 'NOTE', 'X', 'THREADS')),
  method           text not null check (method in ('rss', 'api', 'search')),  -- 巡回（rss・api）か、キーワード検索か
  name             text not null,           -- 画面に出す名前
  target           text not null,           -- RSS の URL、チャンネル ID、検索キーワードなど
  active           boolean not null default true,
  last_fetched_at  timestamptz,
  created_at       timestamptz not null default now(),
  unique (kind, method, target)
);

-- 収集先が主に狙うペルソナ
create table public.source_personas (
  source_id   uuid not null references public.sources (id) on delete cascade,
  persona_id  uuid not null references public.personas (id) on delete cascade,
  primary key (source_id, persona_id)
);

-- ========== 記事 ==========
create table public.articles (
  id                  uuid primary key default gen_random_uuid(),
  no                  bigint generated always as identity unique,
  source_id           uuid references public.sources (id) on delete set null,
  type                text not null check (type in ('news', 'sns')),
  kind                text not null check (kind in ('NEWS', 'YOUTUBE', 'NOTE', 'X', 'THREADS')),
  source_name         text not null,
  category            text not null default '',
  title               text not null,
  excerpt             text not null default '',
  url                 text not null unique check (url ~ '^https?://'),  -- H6: http(s) だけ
  collected_at        timestamptz not null default now(),
  status              text not null default 'pending'
                        check (status in ('pending', 'approved', 'rejected', 'published')),
  primary_persona_id  uuid references public.personas (id) on delete set null,
  verdict             text check (verdict in ('adopt', 'hold', 'reject')),
  editor_comment      text not null default '',
  notion_db           text not null default 'articles'
                        check (notion_db in ('articles', 'sns_posts', 'ideas')),
  notion_page_id      text unique,
  published_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index articles_status_collected_idx on public.articles (status, collected_at desc);
create index articles_persona_idx on public.articles (primary_persona_id);
create index articles_source_idx on public.articles (source_id);

create table public.article_persona_scores (
  article_id       uuid not null references public.articles (id) on delete cascade,
  persona_id       uuid not null references public.personas (id) on delete cascade,
  relevance_score  smallint not null check (relevance_score between 0 and 100),
  reasons          text[] not null default '{}',
  model            text,
  judged_at        timestamptz not null default now(),
  primary key (article_id, persona_id)
);
create index article_persona_scores_persona_idx
  on public.article_persona_scores (persona_id, relevance_score desc);

-- ========== 更新日時と公開の制御 ==========
create function public.touch_updated_at() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger personas_touch before update on public.personas
  for each row execute function public.touch_updated_at();

-- 公開・非公開の切り替えは管理者だけ（H2）。自動処理（auth.uid() が NULL）は対象外
create function public.articles_before_update() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if (new.status = 'published') <> (old.status = 'published')
     and auth.uid() is not null and not public.is_admin() then
    raise exception '公開・非公開の切り替えは管理者だけができます' using errcode = '42501';
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

create trigger articles_before_update before update on public.articles
  for each row execute function public.articles_before_update();

-- ========== 権限（RLS） ==========
-- 未ログイン（anon）向けのルールは作らない。公開サイトを本番化するとき（L5）に、公開中の記事だけ読めるルールを足す
alter table public.users                  enable row level security;
alter table public.activity_logs          enable row level security;
alter table public.personas               enable row level security;
alter table public.sources                enable row level security;
alter table public.source_personas        enable row level security;
alter table public.articles               enable row level security;
alter table public.article_persona_scores enable row level security;

-- users: 自分の行は未承認でも読める（「承認待ち」と表示するため）。役割を変えられるのは管理者だけ
create policy users_select on public.users for select to authenticated
  using (id = auth.uid() or public.is_member());
create policy users_update on public.users for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- activity_logs: 読むのはメンバー。書くのは本人の名前でだけ。変更・削除はさせない
create policy activity_logs_select on public.activity_logs for select to authenticated
  using (public.is_member());
create policy activity_logs_insert on public.activity_logs for insert to authenticated
  with check (public.is_member() and actor = 'user' and user_id = auth.uid());

-- personas・sources・source_personas: 読むのはメンバー、変えるのは管理者
create policy personas_select on public.personas for select to authenticated using (public.is_member());
create policy personas_write  on public.personas for all    to authenticated using (public.is_admin()) with check (public.is_admin());

create policy sources_select on public.sources for select to authenticated using (public.is_member());
create policy sources_write  on public.sources for all    to authenticated using (public.is_admin()) with check (public.is_admin());

create policy source_personas_select on public.source_personas for select to authenticated using (public.is_member());
create policy source_personas_write  on public.source_personas for all    to authenticated using (public.is_admin()) with check (public.is_admin());

-- articles: メンバーは読む・追加（要確認でだけ）・更新できる。公開の切り替えは上のトリガーで管理者に限る。削除は管理者だけ
create policy articles_select on public.articles for select to authenticated using (public.is_member());
create policy articles_insert on public.articles for insert to authenticated
  with check (public.is_member() and status = 'pending');
create policy articles_update on public.articles for update to authenticated
  using (public.is_member()) with check (public.is_member());
create policy articles_delete on public.articles for delete to authenticated using (public.is_admin());

-- article_persona_scores: メンバーは読む・判定の保存（再判定）ができる。削除は管理者だけ
create policy scores_select on public.article_persona_scores for select to authenticated using (public.is_member());
create policy scores_insert on public.article_persona_scores for insert to authenticated with check (public.is_member());
create policy scores_update on public.article_persona_scores for update to authenticated
  using (public.is_member()) with check (public.is_member());
create policy scores_delete on public.article_persona_scores for delete to authenticated using (public.is_admin());
