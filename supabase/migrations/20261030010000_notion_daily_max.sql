-- Notion news_link から登録する記事を、1 日（日本時間）40 件までにする（daily_max）。
-- 重複を除いたあとに数えるので、超えた分は翌日以降の実行で拾う。1 日の全体の上限（DAILY_LIMIT 100 件）の残りは、YouTube・note に回る
update public.sources
set options = options || '{"daily_max": 40}'::jsonb
where method = 'notion' and target = '3aa2e8c9228c8179bf52e9b3d7e7a7e6';
