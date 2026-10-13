-- 所有人離線後，自動清空聊天室的訊息。
-- 在 schema.sql 之後，於 Supabase 的 SQL Editor 貼上整份內容，按 Run 執行一次。
--
-- 做法：每個在線的瀏覽器每 20 秒呼叫一次 heartbeat() 報到。
-- 資料庫每 30 秒檢查一次，如果超過 150 秒沒有任何人報到，就刪掉所有訊息。

-- 1. 報到紀錄表：沒有開放任何直接存取，只能透過下面的函式
create table if not exists public.online_sessions (
  session_id uuid primary key,
  last_seen  timestamptz not null default now()
);

alter table public.online_sessions enable row level security;
revoke all on public.online_sessions from anon, authenticated;

-- 2. 報到：前端用 supabase.rpc('heartbeat') 呼叫
create or replace function public.heartbeat(p_session uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.online_sessions (session_id, last_seen)
  values (p_session, now())
  on conflict (session_id) do update set last_seen = now();
$$;

revoke execute on function public.heartbeat(uuid) from public;
grant execute on function public.heartbeat(uuid) to anon, authenticated;

-- 3. 檢查：沒人在線就清空訊息（只給排程用，前端不能呼叫）
create or replace function public.clear_chat_if_empty()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.online_sessions where last_seen < now() - interval '150 seconds';

  if not exists (select 1 from public.online_sessions) then
    delete from public.messages where true;
  end if;
end;
$$;

revoke execute on function public.clear_chat_if_empty() from public, anon, authenticated;

-- 4. 排程：每 30 秒執行一次
create extension if not exists pg_cron;

select cron.schedule(
  'clear-empty-chat',
  '30 seconds',
  $$select public.clear_chat_if_empty()$$
);
