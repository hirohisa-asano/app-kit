-- 匿名認証ベースの所有者分離（RLS）と、Push トークンの保管。
--
-- 要点: anon キーはクライアントアプリに同梱されて配布される。
-- したがって `for all to anon using (true)` は「誰でも全ユーザーのデータを読み書きできる」
-- と同義で、クライアント側の .eq('user_id', ...) は絞り込みであってセキュリティ境界ではない。
-- 分離は必ずサーバー側の RLS に担保させる。
--
-- 事前設定: Supabase の Auth で匿名サインインを有効にしておくこと。
--   ローカル: supabase/config.toml の enable_anonymous_sign_ins = true
--   クラウド: Management API で external_anonymous_users_enabled = true
--             （ダッシュボードの Authentication → Sign In / Providers からでも可）

create table if not exists public.items (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  data jsonb not null,
  created_at timestamptz not null default now()
);

-- Push は端末単位で届くので、ユーザーと端末を分けて持つ（1ユーザー複数端末）
create table if not exists public.push_tokens (
  device_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  token text not null,
  updated_at timestamptz not null default now()
);

create index if not exists items_user_idx on public.items (user_id, created_at desc);
create index if not exists push_tokens_user_idx on public.push_tokens (user_id);

alter table public.items enable row level security;
alter table public.push_tokens enable row level security;

-- 本人の行だけ。anon ロールには一切の権限を与えない
create policy "own items" on public.items
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own push_tokens" on public.push_tokens
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ポリシー不在でも拒否されるが、将来うっかり public なポリシーを足した時の保険
revoke all on public.items from anon;
revoke all on public.push_tokens from anon;
