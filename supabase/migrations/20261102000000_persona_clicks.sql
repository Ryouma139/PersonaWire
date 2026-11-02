-- 管理画面用: ペルソナごとのクリック数（呼んだ人の権限で動くので、メンバー以外には 0 行）
--   ペルソナのページと記事のページで押されたクリックに、ペルソナが入っている（link_clicks.persona_id）。
--   トップページなどペルソナの無い場所で押されたものは、persona_id が空の 1 行にまとまる

create view public.persona_click_counts with (security_invoker = true) as
  select persona_id,
         count(*) filter (where created_at >= now() - interval '30 days')::int as clicks_30d,
         count(*)::int as clicks_total
  from public.link_clicks
  group by persona_id;

revoke all on public.persona_click_counts from anon;
grant select on public.persona_click_counts to authenticated;
