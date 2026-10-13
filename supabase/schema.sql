-- 匿名聊天室的資料庫設定。
-- 在 Supabase 網頁的 SQL Editor 貼上整份內容，按 Run 執行一次即可。

-- 1. 訊息資料表：聊天訊息（message）和加入／離開提示（notice）
create table if not exists public.messages (
  id         uuid primary key default gen_random_uuid(),
  type       text not null default 'message' check (type in ('message', 'notice')),
  nickname   text check (nickname is null or char_length(nickname) between 1 and 48),
  content    text not null check (char_length(content) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists messages_created_at_idx on public.messages (created_at desc);

-- 2. 資料庫規則（RLS）：任何人可以讀、可以新增；不能修改、不能刪除
alter table public.messages enable row level security;

drop policy if exists "anyone can read messages" on public.messages;
create policy "anyone can read messages"
  on public.messages for select
  to anon, authenticated
  using (true);

drop policy if exists "anyone can add messages" on public.messages;
create policy "anyone can add messages"
  on public.messages for insert
  to anon, authenticated
  with check (
    type in ('message', 'notice')
    and char_length(content) between 1 and 500
  );

revoke update, delete, truncate on public.messages from anon, authenticated;

-- 3. 只保留最近 200 則：每次新增後，自動刪掉比較舊的
create or replace function public.trim_messages()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.messages
  where id in (
    select id from public.messages
    order by created_at desc, id desc
    offset 200
  );
  return null;
end;
$$;

revoke execute on function public.trim_messages() from public, anon, authenticated;

drop trigger if exists trim_messages_after_insert on public.messages;
create trigger trim_messages_after_insert
  after insert on public.messages
  for each statement execute function public.trim_messages();

-- 4. 開啟 Realtime，新訊息才會即時推給所有人
alter publication supabase_realtime add table public.messages;
