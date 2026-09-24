# expo-supabase-push

「サーバーが定期的に何かを調べて、条件が成立したら端末に Push する」構成の雛形。

Supabase（Postgres + Edge Function + pg_cron）と Expo（React Native）の組み合わせ。
アプリが起動していなくても通知が届く。

```
migrations/0001_schema_and_rls.sql  匿名認証ベースの所有者分離 + push_tokens
migrations/0002_schedule.sql        pg_cron から Edge Function を叩く
functions/scheduled-job/index.ts    定期処理本体（service role で RLS をバイパス）
client/store.ts                     匿名サインインと Push トークン保存
```

## 手順

1. `supabase init` → `supabase link --project-ref <ref>`
2. **匿名サインインを有効にする**（これを忘れると全部 401 になる）
   - ローカル: `supabase/config.toml` の `enable_anonymous_sign_ins = true`
   - クラウド: ダッシュボードの Authentication、または Management API
     ```bash
     curl -X PATCH "https://api.supabase.com/v1/projects/<ref>/config/auth" \
       -H "Authorization: Bearer <personal access token>" \
       -H "Content-Type: application/json" \
       -d '{"external_anonymous_users_enabled": true}'
     ```
3. `migrations/` を `supabase/migrations/` に置いて `supabase db push`
4. `functions/scheduled-job/` を `supabase/functions/` に置いて
   `supabase functions deploy scheduled-job`
5. `0002_schedule.sql` のコメントを外して cron を登録

## RLS の要点

**anon キーはクライアントアプリに同梱されて配布される。**
したがって `for all to anon using (true)` は「誰でも全ユーザーのデータを読み書きできる」
と同義。クライアント側の `.eq('user_id', ...)` は絞り込みであって**セキュリティ境界ではない**。

Tsuuchi では実際にこの状態でリリース手前まで行った。anon キーを取り出して `device_id` の
条件を外せば全ユーザーの行が読め、`push_tokens` が読めれば全員に任意の Push が送れた。

直したあと、実際に攻撃を試して確認すること。

```bash
# anon キーで全件読めてしまわないか
curl "$URL/rest/v1/items?select=*" -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
# → 42501 permission denied なら正しい
```

匿名ユーザーを 2 つ作って、お互いの行が見えないことも確認する。

## ハマりどころ

- **`supabase-js` は `window` が無い環境ではセッションをメモリに持つ。**
  storage を明示しないと、インスタンスごとに別の匿名ユーザーになる。
  テストが「新規ユーザーで 0 件読んで、シードを入れ直したから通った」という
  偽の成功をすることがある
- **匿名ユーザーは admin の users 一覧 API に出てこない。** 消すには DB を直接見て ID を拾う
- **service role キーをファイルに置くときはラベルを付けない。**
  `service_role | eyJ...` のような形式にすると `cat` でそのまま使えず 401 になる
- cron を止めるのを忘れない。`select cron.unschedule('scheduled-job');`
