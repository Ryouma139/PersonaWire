# Supabase（DB と権限）

第1段階（H1・H2）の DB 定義です。表・関数・トリガー・権限ルールの解説は [SCHEMA.md](SCHEMA.md)、表の設計は [docs/DB.md](../docs/DB.md)、背景は [docs/OVERVIEW.md](../docs/OVERVIEW.md) を参照してください。

| ファイル | 中身 |
|---|---|
| [migrations/20261028000000_phase1.sql](migrations/20261028000000_phase1.sql) | 表（`users`、`activity_logs`、`personas`、`sources`、`source_personas`、`articles`、`article_persona_scores`）、権限ルール（RLS）、トリガー |
| [migrations/20261029000000_collector.sql](migrations/20261029000000_collector.sql) | 第2段階の収集バッチ用。`sources` に Notion 用の設定を追加、実行履歴 `collect_runs`、news_link を収集先に登録（[collector/](../collector/README.md)） |
| [migrations/20261029010000_youtube_sources.sql](migrations/20261029010000_youtube_sources.sql) | YouTube の 5 チャンネルを収集先に登録（各チャンネル 1 回 2 本まで） |
| [migrations/20261029020000_purge_rejected.sql](migrations/20261029020000_purge_rejected.sql) | 却下から 5 日たった記事を削除する関数と、削除した URL の記録（`purged_urls`）。収集バッチが 2 時間ごとに呼ぶ |
| [migrations/20261029030000_note_source.sql](migrations/20261029030000_note_source.sql) | note 全体の注目記事（`https://note.com/rss`）を収集先に登録（1 回 2 件まで） |
| [migrations/20261029040000_note_hashtags.sql](migrations/20261029040000_note_hashtags.sql) | note の収集をハッシュタグ（#投資・#筋トレ・#子育て・#節約・#移住、各 1 回 2 件まで）に切り替え、注目記事は止める |
| [migrations/20261029050000_article_excerpt.sql](migrations/20261029050000_article_excerpt.sql) | 要約が空の記事に元記事の概要を入れる関数と、取得を試した印（`articles.excerpt_checked_at`）。実行履歴に件数の列を追加 |
| [migrations/20261030000000_site_affiliate.sql](migrations/20261030000000_site_affiliate.sql) | 公開サイトとアフィリエイト。商品（`products`、`product_personas`）、記事と商品の紐づけ（`article_products`）、クリック記録（`link_clicks`）、公開サイト用のビュー（`public_*`）、クリックを記録する `record_click`。公開には編集コメント 20 字以上が必要、公開・非公開の切り替えは管理者だけ |
| [seed.sql](seed.sql) | 開発用のサンプルデータ（ペルソナ 5 件、記事 14 件、スコア 70 件）。`ts/src/store.ts` の初期データから自動生成。何度実行しても重複しない |

## 適用のしかた

1. Supabase のダッシュボードで **SQL Editor** を開く。
2. `migrations/20261028000000_phase1.sql` の中身をすべて貼り付けて **Run**。
3. 続けて `seed.sql` の中身を貼り付けて **Run**。

migration は 1 回だけ実行します。2 回実行すると「すでにある」というエラーになります。

## 権限のまとめ

| 操作 | 未承認 | 編集者 | 管理者 | 自動処理 |
|---|---|---|---|---|
| 記事・ペルソナ・収集先を見る | × | ○ | ○ | ○ |
| 記事を追加する（要確認でだけ） | × | ○ | ○ | ○ |
| 採用・却下・要確認に戻す、コメント、再判定 | × | ○ | ○ | ○ |
| 公開する・非公開に戻す | × | × | ○ | ○ |
| 記事を削除する | × | × | ○ | ○ |
| ペルソナ・収集先を変える | × | × | ○ | ○ |
| ほかの人の役割を変える | × | × | ○ | ○ |

- 初めてログインした人は「未承認」（`users.role` が空）になり、自分の行以外は何も見えません。管理者が役割を付けます。
- 最初の管理者は、本人が一度ログインしたあと、SQL Editor で次を実行して決めます。

  ```sql
  update public.users set role = 'admin' where email = '<管理者のメールアドレス>';
  ```

- 「自動処理」は、サーバーから `service_role` で動く収集・判定（第2段階）のことです。RLS の対象外になります。

## まだ守れていないこと

- 未配信の配信号に却下した記事が残らないようにするルールは、配信号の表（`issues`、`issue_articles`）を DB に移すときに、DB 側でも作ります。今は画面側（`store.setItemStatus()`）で守っています。
- 未ログインの読者向けの読み取り（公開サイト）は、公開サイトを本番化するとき（L5）に追加します。
