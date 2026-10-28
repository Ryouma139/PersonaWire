-- YouTube のチャンネルを収集先に登録する（RSS。API キーは不要）。各チャンネル、1 回の実行で新しい動画 2 本まで（max_items）
-- 何度実行しても、同じチャンネルは二重に登録しない（on conflict は kind・method・target の一意制約）
insert into public.sources (kind, method, name, target, options) values
  ('YOUTUBE', 'rss', 'YouTube PIVOT 公式チャンネル',
   'https://www.youtube.com/feeds/videos.xml?channel_id=UC8yHePe_RgUBE-waRWy6olw',
   '{"max_items": 2, "category": "経済", "category_personas": {"経済": ["P01"]}}'),
  ('YOUTUBE', 'rss', 'YouTube ほしみみ',
   'https://www.youtube.com/feeds/videos.xml?channel_id=UCl5dRvcetDAL_t40oX1Lz2w',
   '{"max_items": 2, "category": "子育て", "category_personas": {"子育て": ["P03"]}}'),
  ('YOUTUBE', 'rss', 'YouTube 学識サロン',
   'https://www.youtube.com/feeds/videos.xml?channel_id=UCC4NkFV-L-vVYD5z_Ei5dUA',
   '{"max_items": 2, "category": "自己啓発", "category_personas": {"自己啓発": ["P04"]}}'),
  ('YOUTUBE', 'rss', 'YouTube 山本義徳 筋トレ大学',
   'https://www.youtube.com/feeds/videos.xml?channel_id=UC7F_CLFtxDetmUnORgmwImg',
   '{"max_items": 2, "category": "ヘルス", "category_personas": {"ヘルス": ["P02"]}}'),
  ('YOUTUBE', 'rss', 'YouTube よし 移住しよう。',
   'https://www.youtube.com/feeds/videos.xml?channel_id=UCBoirbYzt1wGTfDG2Hf0kEw',
   '{"max_items": 2, "category": "地域", "category_personas": {"地域": ["P05"]}}')
on conflict (kind, method, target) do nothing;
