-- 記事の種類に MEDIUM を足し、Medium のタグ #japan を収集先に登録する（英語の記事。Japan Outdoors のペルソナ向け）
--   - Medium はトップページに RSS が無く、タグ・人・publication ごとに RSS がある（https://medium.com/feed/tag/<タグ>）
--   - 1 回の実行で 2 件まで（max_items）。仮の主担当は P08 Culture & Landmarks（記事ごとに管理画面で変えられる）

alter table public.sources drop constraint sources_kind_check;
alter table public.sources add constraint sources_kind_check check (kind in ('NEWS', 'YOUTUBE', 'NOTE', 'X', 'THREADS', 'MEDIUM'));

alter table public.articles drop constraint articles_kind_check;
alter table public.articles add constraint articles_kind_check check (kind in ('NEWS', 'YOUTUBE', 'NOTE', 'X', 'THREADS', 'MEDIUM'));

insert into public.sources (kind, method, name, target, options) values
  ('MEDIUM', 'rss', 'Medium #japan', 'https://medium.com/feed/tag/japan',
   '{"max_items": 2, "category": "Japan", "category_personas": {"Japan": ["P08"]}}');
