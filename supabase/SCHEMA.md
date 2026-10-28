# 第1段階の DB — 表・関数・トリガー・権限ルール

[migrations/20261028000000_phase1.sql](migrations/20261028000000_phase1.sql) で作るものの解説です。適用の手順は [README.md](README.md)、全体の設計は [docs/DB.md](../docs/DB.md) を参照してください。

| 種類 | 数 |
|---|---|
| 表 | 7 |
| 関数 | 6 |
| トリガー | 3 |
| 権限ルール（ポリシー） | 18 |

---

## 1. 表

| # | 表 | 中身 |
|---|---|---|
| 1 | `users` | 管理画面を使う人と、その役割（管理者・編集者・未承認） |
| 2 | `activity_logs` | 誰が、いつ、何をしたかの記録 |
| 3 | `personas` | ペルソナ（読者像と判定基準） |
| 4 | `sources` | 収集先（RSS、チャンネル、検索キーワードなど） |
| 5 | `source_personas` | 収集先がどのペルソナ向けかの対応 |
| 6 | `articles` | 収集した記事 |
| 7 | `article_persona_scores` | 記事 × ペルソナごとのスコアと判定理由 |

### `users`（管理画面を使う人）

| 列 | 型 | 説明 |
|---|---|---|
| `id` | uuid | Supabase のログインユーザー（`auth.users`）と同じ ID |
| `email` | text | メールアドレス（重複不可） |
| `name` | text | 表示名。Google の名前、無ければメールアドレス |
| `role` | text | `admin`（管理者）/ `editor`（編集者）/ 空（未承認） |
| `created_at` | timestamptz | 登録日時 |

### `activity_logs`（操作の記録）

| 列 | 型 | 説明 |
|---|---|---|
| `id` | bigint | 自動の連番 |
| `actor` | text | `user`（人の操作）/ `system`（自動処理） |
| `user_id` | uuid | 操作した人。指定しなければログイン中の人が自動で入る |
| `action` | text | 何をしたか。例：`article.publish` |
| `target_type` / `target_id` | text | 何に対してか。例：`article` と記事の ID |
| `detail` | jsonb | 補足情報（変更前後の状態など） |
| `created_at` | timestamptz | 日時 |

`actor` が `user` のときは、必ず `user_id` が入ります（制約）。

### `personas`（ペルソナ）

| 列 | 型 | 説明 |
|---|---|---|
| `id` | uuid | 内部 ID |
| `code` | text | 表示用のコード `P01`（重複不可） |
| `name` / `description` | text | 名前と説明 |
| `handle` | text | 公開サイトの URL に使う名前。例：`tech-invest`（重複不可） |
| `color` | text | 表示色。`#6f95d6` の形だけを許す |
| `keywords` / `ng_words` | text[] | 関心キーワードと NG ワード（配列） |
| `tone` | text | 文章のトーン |
| `threshold` | smallint | 採用しきい値（0〜100） |
| `active` | boolean | 有効か |
| `created_at` / `updated_at` | timestamptz | 作成・更新日時 |

### `sources`（収集先）

| 列 | 型 | 説明 |
|---|---|---|
| `id` | uuid | 内部 ID |
| `kind` | text | `NEWS` / `YOUTUBE` / `NOTE` / `X` / `THREADS` |
| `method` | text | `rss` / `api`（巡回）、`search`（キーワード検索） |
| `name` | text | 画面に出す名前 |
| `target` | text | RSS の URL、チャンネル ID、検索キーワードなど |
| `active` | boolean | 収集するか |
| `last_fetched_at` | timestamptz | 最後に取得した日時 |
| `created_at` | timestamptz | 登録日時 |

同じ `kind`・`method`・`target` の組み合わせは、二重に登録できません。

### `source_personas`（収集先 ↔ ペルソナ）

| 列 | 説明 |
|---|---|
| `source_id` + `persona_id` | 2 つ合わせて重複不可。収集先とペルソナのどちらかを消すと、この行も消える |

### `articles`（記事）

| 列 | 型 | 説明 |
|---|---|---|
| `id` | uuid | 内部 ID |
| `no` | bigint | 画面に出す番号 `#1024`。自動採番 |
| `source_id` | uuid | どの収集先から来たか（収集先を消すと空になる） |
| `type` / `kind` | text | `news`・`sns` / `NEWS` など |
| `source_name` / `category` / `title` / `excerpt` | text | 媒体名、カテゴリ、タイトル、要約 |
| `url` | text | 元記事。`http(s)://` で始まるものだけ（H6）、重複不可 |
| `collected_at` | timestamptz | 収集日時 |
| `status` | text | `pending` / `approved` / `rejected` / `published` |
| `primary_persona_id` | uuid | 主担当ペルソナ（ペルソナを消すと空になる） |
| `verdict` | text | AI 判定 `adopt` / `hold` / `reject` |
| `editor_comment` | text | 編集コメント |
| `notion_db` / `notion_page_id` | text | Notion の登録先とページ ID（第3段階で使う） |
| `published_at` | timestamptz | 公開日時（トリガーが自動で記録・削除する） |
| `created_at` / `updated_at` | timestamptz | 作成・更新日時 |

### `article_persona_scores`（スコア）

| 列 | 型 | 説明 |
|---|---|---|
| `article_id` + `persona_id` | uuid | 2 つ合わせて重複不可。記事かペルソナを消すと一緒に消える |
| `relevance_score` | smallint | 0〜100 |
| `reasons` | text[] | 判定理由のタグ |
| `model` | text | 判定に使った AI モデル（サンプルは `sample`） |
| `judged_at` | timestamptz | 判定日時 |

---

## 2. 関数

| # | 関数 | 役割 | 使われる場所 |
|---|---|---|---|
| 1 | `app_role()` | ログイン中の人の役割を返す（`admin` / `editor` / 空） | 下の 2 つから呼ばれる |
| 2 | `is_member()` | 管理者か編集者なら true | 権限ルールの「メンバーだけ読める」など |
| 3 | `is_admin()` | 管理者なら true | 権限ルールの「管理者だけ変えられる」など |
| 4 | `handle_new_user()` | 初めてログインした人の行を `users` に作る（役割は空 = 未承認） | トリガー `on_auth_user_created` |
| 5 | `touch_updated_at()` | 更新日時を自動で今にする | トリガー `personas_touch` |
| 6 | `articles_before_update()` | 公開の切り替えを管理者だけに制限する。公開日時の記録・削除と、更新日時の更新も行う | トリガー `articles_before_update` |

### 処理の中身

```text
① app_role()
   users 表から「自分（auth.uid()）の行」の role を取り出す

② is_member()   app_role() が admin か editor なら true
③ is_admin()    app_role() が admin なら true

④ handle_new_user()
   users に (ID, メール, 名前) を追加する。role は入れない（= 未承認）

⑤ touch_updated_at()
   更新される行の updated_at を now() にする

⑥ articles_before_update()
   1. 「公開中になる、または公開中でなくなる」変更で、
      ログインした人が管理者でなければ → エラーで止める
      （auth.uid() が空 = 自動処理なら止めない）
   2. 公開中になったら published_at に今の日時を入れる
      公開中でなくなったら published_at を空にする
   3. updated_at を今にする
```

①〜④には `security definer` を付けています。「関数を作った人（DB の管理者）の権限で動く」という指定です。たとえば `is_member()` は `users` 表を読む必要がありますが、未承認の人は `users` 表を読めません。この指定がないと、判定そのものができなくなります。

---

## 3. トリガー

関数を「ある操作が起きたとき」に自動で動かす仕掛けです。

| トリガー | いつ | 何をするか |
|---|---|---|
| `on_auth_user_created` | Supabase の `auth.users` に行が追加された**後** | `handle_new_user()` を呼び、`users` に未承認の行を作る |
| `personas_touch` | `personas` の行が更新される**直前** | `touch_updated_at()` を呼ぶ |
| `articles_before_update` | `articles` の行が更新される**直前** | `articles_before_update()` を呼ぶ。エラーなら更新自体が取り消される |

---

## 4. 権限ルール（RLS）

### ポリシーの内訳（18 個）

| 表 | 数 | 内容 |
|---|---|---|
| `users` | 2 | 見る、役割を変える |
| `activity_logs` | 2 | 見る、書く（変更・削除のルールは作らないので、誰もできない） |
| `personas` | 2 | 見る、変える |
| `sources` | 2 | 見る、変える |
| `source_personas` | 2 | 見る、変える |
| `articles` | 4 | 見る、追加、更新、削除 |
| `article_persona_scores` | 4 | 見る、追加、更新、削除 |

### 役割ごとにできること

| 操作 | 未承認 | 編集者 | 管理者 | 自動処理 |
|---|---|---|---|---|
| 記事・ペルソナ・収集先を見る | × | ○ | ○ | ○ |
| 記事を追加する（要確認でだけ） | × | ○ | ○ | ○ |
| 採用・却下・要確認に戻す、コメント、再判定 | × | ○ | ○ | ○ |
| 公開する・非公開に戻す | × | × | ○ | ○ |
| 記事を削除する | × | × | ○ | ○ |
| ペルソナ・収集先を変える | × | × | ○ | ○ |
| ほかの人の役割を変える | × | × | ○ | ○ |

未承認の人も、`users` 表の自分の行だけは見られます（「承認待ち」と表示するため）。

### どこで働くか

権限ルールは、Supabase の中にある **Postgres（DB）そのもの**で働きます。ブラウザや管理画面のプログラムではありません。

```text
管理画面（ブラウザ）
  │  「記事 #1024 を公開中にして」
  │  ＋ Publishable key（どのプロジェクトか）
  │  ＋ ログインの証明書（誰か。ログインすると Supabase が発行する）
  ▼
Supabase の API（受付）
  │  証明書から「この人は 〇〇 さん（ID: xxx）」と判断し、DB に伝える
  ▼
Postgres（DB） ◀── ここで権限ルールが働く
  │  ① RLS: この人はどの行を見られるか・変えられるか
  │      → 見られない行は、最初から無いものとして扱う
  │      → 書けない内容なら、エラーを返す
  │  ② トリガー: 公開の切り替えなら、管理者かどうかを確認する
  ▼
許可されたものだけが返る、または保存される
```

### なぜ DB で守るのか

| 守る場所 | 回避できるか |
|---|---|
| 管理画面（ボタンを隠す） | できる。Publishable key は公開されているので、開発者ツールや自作のプログラムから API を直接呼べてしまう |
| DB（RLS・トリガー） | できない。どこから呼んでも、必ず DB を通る |

- **DB:** 本当の守り。破られると困ることは、すべてここで止める。
- **管理画面:** 使いやすさ。押せない操作のボタンを隠し、分かりやすいメッセージを出す。

**例：編集者が「公開」しようとしたとき**

1. 管理画面から「公開中にして」という依頼が届く。
2. RLS の更新ルール：編集者はメンバーなので、記事の更新自体は許可される。
3. トリガー `articles_before_update()`：公開への切り替えで、管理者ではないので、エラーで止める。
4. 管理画面には「公開・非公開の切り替えは管理者だけができます」が返る。

### 権限ルールが効かない入り口

| 入り口 | 誰が使うか | 注意 |
|---|---|---|
| SQL Editor（ダッシュボード） | Supabase のアカウントにログインした人 | DB の最高権限で動く。サンプルデータの投入（seed）がルールに止められないのはこのため |
| Secret key / service_role key | 第2段階のサーバー処理（収集・AI判定） | この鍵は絶対にブラウザに置いたり、人に渡したりしない |

### ダッシュボードで確認できる場所

- **Authentication → Policies:** 表ごとのルールが一覧で見られる。
- **Table Editor:** 各表に「RLS enabled」と表示される。「RLS disabled」の表があれば、誰でも読み書きできる状態なので要注意。
- **Database → Functions:** 関数 6 つが見られる。

---

## 5. 管理画面での編集

表は管理画面から編集できるようにします。権限ルールはそのまま効きます。

| 画面 | 編集する表 | 使える人 | 予定 |
|---|---|---|---|
| ペルソナ（既存） | `personas` | 管理者 | 手順4で DB につなぐ |
| 収集・AI判定（既存） | `articles`、`article_persona_scores` | 編集者・管理者（公開は管理者だけ） | 手順4で DB につなぐ |
| ダッシュボード（既存） | `activity_logs` は読むだけ | 編集者・管理者 | 手順4で DB につなぐ |
| **ユーザー管理（新規）** | `users`（役割の承認・変更） | 管理者 | 新しく作る |
| **収集先（新規）** | `sources`、`source_personas` | 管理者 | 新しく作る |

どの表でも直接書き換えられる汎用の編集画面は作りません。入力チェックや操作の記録を素通りしやすいためです。一時的なデータの修正は、Supabase の **Table Editor** で行います。ただし Table Editor は権限ルールを無視するので、使えるのは Supabase のアカウントを持つ人だけです。
