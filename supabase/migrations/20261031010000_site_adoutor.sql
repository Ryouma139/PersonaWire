-- 2 つ目の公開サイト（海外の旅行者向け、英語。site_adoutor/）と、そのペルソナ P06〜P08 を登録する。
-- 必ず、Persona Wire の公開サイト（site/）がサイトで絞り込む版に入れ替わってから実行する。
-- それより前に実行すると、P06〜P08 が Persona Wire のペルソナの並びにも出てしまう
--
-- サイト名・キャッチコピー・運営者情報は仮。あとから sites の行を書き換えれば、デプロイし直さずに変わる

insert into public.sites (code, name, tagline, locale, operator_name, operator_site_url, operator_x_url, contact_url)
values ('adoutor', 'Japan Outdoors', 'Outdoors, food and culture in Japan — picked by our editors.', 'en',
        'R (IT freelancer)', 'https://product-adree.vercel.app/', 'https://x.com/YpKwCSPTK7KxNUk',
        'https://docs.google.com/forms/d/e/1FAIpQLSfJuivVzfoc9t5PFSmXATH5QF-ATAMFejvvxRVN4OHk8HR1-g/viewform');

-- 名前と説明は英語（公開サイトにそのまま出る）。キーワードは、記事を選ぶときと AI 採点の手がかり
insert into public.personas (code, name, handle, color, description, keywords, tone) values
  ('P06', 'Outdoors in Japan', 'outdoor', '#2f7d4f',
   'Visitors who want hiking, mountains, hot springs, camping and seasonal nature in Japan.',
   '{hiking,mountain,onsen,camping,nature,autumn leaves,cherry blossom,Mt. Fuji,national park,cycling}', 'friendly, practical'),
  ('P07', 'Food in Japan', 'food', '#c0552b',
   'Visitors who travel for Japanese food: ramen, sushi, izakaya, street food, markets and regional dishes.',
   '{ramen,sushi,izakaya,street food,market,wagyu,sake,food tour,local food,restaurant}', 'friendly, appetizing'),
  ('P08', 'Culture & Landmarks', 'culture', '#7a4fa0',
   'Visitors interested in temples, shrines, castles, festivals, museums and famous sights in Japan.',
   '{temple,shrine,castle,festival,museum,Kyoto,Tokyo,history,tradition,landmark}', 'friendly, informative');

insert into public.site_personas (site_id, persona_id)
select s.id, p.id from public.sites s cross join public.personas p
where s.code = 'adoutor' and p.code in ('P06', 'P07', 'P08');
