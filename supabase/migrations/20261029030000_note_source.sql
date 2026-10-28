-- note 全体の注目記事（https://note.com/rss）を収集先に登録する。1 回の実行で新しい 2 件まで（max_items）
-- 話題がさまざまなので、カテゴリとペルソナの対応は付けない（AI 判定に任せる）
-- 何度実行しても二重に登録しない（on conflict は kind・method・target の一意制約）
insert into public.sources (kind, method, name, target, options) values
  ('NOTE', 'rss', 'note 注目記事', 'https://note.com/rss', '{"max_items": 2}')
on conflict (kind, method, target) do nothing;
