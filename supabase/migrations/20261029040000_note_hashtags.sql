-- note の収集を、注目記事（https://note.com/rss）から、ペルソナごとのハッシュタグに切り替える。各 1 回 2 件まで（max_items）
-- 条件は、AI 判定（H4）を入れるときに見直す

-- 注目記事は止める（行は残すので、active を true に戻せば再開できる）
update public.sources set active = false where method = 'rss' and target = 'https://note.com/rss';

-- ハッシュタグの新着（URL のタグ名は URL エンコードしてある）
insert into public.sources (kind, method, name, target, options) values
  ('NOTE', 'rss', 'note #投資', 'https://note.com/hashtag/%E6%8A%95%E8%B3%87/rss',
   '{"max_items": 2, "category": "経済", "category_personas": {"経済": ["P01"]}}'),
  ('NOTE', 'rss', 'note #筋トレ', 'https://note.com/hashtag/%E7%AD%8B%E3%83%88%E3%83%AC/rss',
   '{"max_items": 2, "category": "ヘルス", "category_personas": {"ヘルス": ["P02"]}}'),
  ('NOTE', 'rss', 'note #子育て', 'https://note.com/hashtag/%E5%AD%90%E8%82%B2%E3%81%A6/rss',
   '{"max_items": 2, "category": "子育て", "category_personas": {"子育て": ["P03"]}}'),
  ('NOTE', 'rss', 'note #節約', 'https://note.com/hashtag/%E7%AF%80%E7%B4%84/rss',
   '{"max_items": 2, "category": "マネー", "category_personas": {"マネー": ["P04"]}}'),
  ('NOTE', 'rss', 'note #移住', 'https://note.com/hashtag/%E7%A7%BB%E4%BD%8F/rss',
   '{"max_items": 2, "category": "地域", "category_personas": {"地域": ["P05"]}}')
on conflict (kind, method, target) do nothing;
