-- 売上（手入力）。月ごとに、購読（note メンバーシップなど）と、ASP ごとのアフィリエイト報酬を入れる
--   - 1 行 = ある月の、ある売上の種類の金額（円）。同じ月・同じ種類は 1 行だけ
--   - 見るのはメンバー、入れる・直すのは管理者だけ（商品と同じ）

create table public.revenues (
  month       date not null check (extract(day from month) = 1),   -- その月の 1 日
  source      text not null check (source in ('subscription', 'amazon', 'rakuten', 'a8', 'moshimo', 'other')),
  amount      integer not null default 0 check (amount >= 0),
  updated_at  timestamptz not null default now(),
  primary key (month, source)
);

create trigger revenues_touch before update on public.revenues
  for each row execute function public.touch_updated_at();

alter table public.revenues enable row level security;
create policy revenues_select on public.revenues for select to authenticated using (public.is_member());
create policy revenues_write  on public.revenues for all    to authenticated using (public.is_admin()) with check (public.is_admin());
