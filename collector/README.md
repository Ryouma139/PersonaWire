# Persona Wire 収集バッチ（Cloudflare Workers）

収集先（Notion の news_link、RSS、note のマガジン）から新着を読み、Supabase の `articles` に「要確認・AI判定待ち」で登録します。改善計画の H3 です。

## 動き

1. 2 時間ごと、日本時間の 0:00・2:00 … 22:00 に動く（`wrangler.jsonc` の `crons`。Cron は UTC で書くので `0 1-23/2 * * *`）。`POST /run` で手動でも動かせる。
   - 管理画面の「今すぐ収集」ボタン: ログイン中の人の証明書を送る。Worker が Supabase で確かめ、承認済みのメンバー（管理者・編集者）なら実行する。ブラウザからは `ALLOWED_ORIGINS` に載っている管理画面からだけ呼べる。
   - コマンドから: `RUN_TOKEN` を送る（下の「手動で動かして確かめる」）。
2. `sources` 表の有効な収集先を読む。
   - **notion:** 親ページ（news_link）の下の日付ページ（`2026/10/28` など）のうち、`lookback_days` 日以内のものをたどり、その中の「記事一覧」データベースを読む。
   - **rss:** RSS 2.0 か Atom を読む。note のマガジンは `https://note.com/<ユーザー>/m/<マガジンID>/rss`。
3. 次の記事は取り込まない。
   - URL が `http(s)` でない（H6）
   - カテゴリが `exclude_categories` に入っている
   - 見出しに、有効なペルソナ全員の NG ワードが入っている
   - すでに `articles` にある（URL で判定）
4. 新しい記事から順に、日本時間の 1 日あたり `DAILY_LIMIT`（100）件まで登録する。上限で漏れた記事は、翌日以降の実行で拾う（Notion は `lookback_days` の範囲内）。
5. 要約が空の記事（Notion のニュースなど）は、元記事のページの先頭だけを読み、概要（og:description など）を要約に入れる。新しい記事から 1 回 `EXCERPT_LIMIT`（5）件まで。ただし、1 回の実行の外部通信の回数（`SUBREQUEST_LIMIT`。無料プランは 50）の残りが少ないときは、自動で減らす。実際の回数は実行履歴の `detail.subrequests` に残る。取れなかった記事は `excerpt_checked_at` に印を付け、取りに行き直さない。
6. 実行結果を `collect_runs` に、登録があれば操作ログ（`activity_logs`、実行者は「システム」）に残す。

| 記事の項目 | Notion（記事一覧） | RSS |
|---|---|---|
| 見出し | タイトル | title |
| URL | 出典URL（空ならページの URL） | link |
| 媒体名 | サイト | 収集先の名前 |
| カテゴリ | カテゴリ | `options.category` |
| 要約 | （なし） | description / summary（200 文字まで） |
| 収集日時 | ページの作成日時 | pubDate / published |
| 種別 | URL のドメインから判定（youtube.com → YOUTUBE、note.com → NOTE など） | 同じ |
| 仮の主担当 | `category_personas` でカテゴリから決める | 同じ |

## 初めて動かすとき

### 1. DB を更新する

Supabase の SQL Editor で [../supabase/migrations/20261029000000_collector.sql](../supabase/migrations/20261029000000_collector.sql) を実行する。news_link が収集先として登録される。

### 2. Notion をつなぐ

1. https://www.notion.so/my-integrations で内部インテグレーションを作り、トークンを控える。
2. Notion で「news_link」ページを開き、右上の「…」→「接続」から、作ったインテグレーションを追加する（下の日付ページと記事一覧にも権限が及ぶ）。

### 3. Supabase の Secret key を用意する

Supabase の Project Settings → **API Keys** → Secret keys で、鍵を作って控える（`sb_secret_...`）。RLS を無視して書き込める鍵なので、Worker の秘密情報にだけ置く。

### 4. 秘密情報を登録して、デプロイする

```bash
cd collector
npm install
npx wrangler login                        # sns-posting で済んでいれば不要
npx wrangler secret put SUPABASE_SECRET_KEY
npx wrangler secret put NOTION_TOKEN
npx wrangler secret put RUN_TOKEN          # 手動実行用の合言葉。長いランダムな文字列にする
npm run deploy
```

### 5. 手動で動かして確かめる

```bash
curl -X POST https://persona-wire-collector.<あなたのサブドメイン>.workers.dev/run -H "Authorization: Bearer <RUN_TOKEN>"
```

登録件数と収集先ごとの内訳が返る。管理画面の「収集・AI判定」に、「AI判定待ち」の記事が並ぶ。

## 手元で動かす

`collector/.dev.vars` に秘密情報を書く（Git には入らない）。

```ini
SUPABASE_SECRET_KEY=sb_secret_...
NOTION_TOKEN=ntn_...
RUN_TOKEN=local-test
```

```bash
npm run dev
curl "http://localhost:8788/__scheduled"   # 定期実行と同じ処理を 1 回動かす
```

手元で動かしても、登録先は本番の Supabase です。

## 収集先を足す

収集先の画面ができるまでは、SQL Editor で `sources` に行を足す。

```sql
-- note のマガジン（RSS）
insert into public.sources (kind, method, name, target, options)
values ('NOTE', 'rss', 'note 節約マガジン', 'https://note.com/<ユーザー>/m/<マガジンID>/rss',
        '{"category": "節約", "category_personas": {"節約": ["P04"]}}');
```

```sql
-- YouTube のチャンネル（RSS。API キーは不要。RSS には新しい動画 15 本まで。max_items で 1 回に取り込む数を絞る）
insert into public.sources (kind, method, name, target, options)
values ('YOUTUBE', 'rss', 'YouTube <チャンネル名>', 'https://www.youtube.com/feeds/videos.xml?channel_id=<UC で始まるチャンネル ID>',
        '{"max_items": 2, "category": "テクノロジー", "category_personas": {"テクノロジー": ["P01"]}}');
```

チャンネル ID は、YouTube のチャンネルページで「概要」→「チャンネルを共有」→「チャンネル ID をコピー」で取れる（`UC` で始まる 24 文字）。

止めるときは `active` を `false` にする。

X は RSS が無く、読み取りには X API の有料プランが必要なため、まだ対応していない。

## 自動デプロイ

GitHub の `main` に、`collector/` の変更をプッシュすると、Cloudflare の Workers Builds が自動で公開する。

| 設定 | 値 |
|---|---|
| Root directory | `collector` |
| Build command | （なし） |
| Deploy command | `npx wrangler deploy` |
| Build watch paths | `collector/*` |

秘密情報（`SUPABASE_SECRET_KEY`、`NOTION_TOKEN`、`RUN_TOKEN`）は Worker に登録したものがそのまま使われる。GitHub にもビルド設定にも書かない。手元から公開するときは `npm run deploy`。
