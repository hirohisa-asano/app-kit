-- 定期実行。Edge Function を cron から叩く。
--
-- <PROJECT_REF> と <ANON_KEY> を置き換えてから、デプロイ後に一度だけ実行する。
-- Edge Function 側は service role キーで動くので RLS をバイパスできる。

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- select cron.schedule(
--   'scheduled-job', '*/5 * * * *',
--   $$ select net.http_post(
--        url := 'https://<PROJECT_REF>.supabase.co/functions/v1/scheduled-job',
--        headers := '{"Authorization": "Bearer <ANON_KEY>"}'::jsonb
--      ) $$
-- );

-- 止めるとき:
--   select cron.unschedule('scheduled-job');
