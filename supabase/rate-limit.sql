-- 發送頻率限制：由資料庫強制執行，不是只靠前端擋。
-- 同一個代號在 10 秒內最多只能送出 6 則訊息，超過的會被資料庫拒絕。
-- 在 schema.sql 之後，於 Supabase 的 SQL Editor 貼上整份內容，按 Run 執行一次。
--
-- 就算有人繞過網頁、直接用公開金鑰呼叫資料庫，也一樣會被擋下。
-- 只限制聊天訊息（type = 'message'），不影響加入／離開提示。

create or replace function public.limit_message_rate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.type = 'message' and new.nickname is not null then
    if (
      select count(*)
      from public.messages
      where type = 'message'
        and lower(nickname) = lower(new.nickname)
        and created_at > now() - interval '10 seconds'
    ) >= 6 then
      raise exception 'rate_limited' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.limit_message_rate() from public, anon, authenticated;

drop trigger if exists limit_message_rate_before_insert on public.messages;
create trigger limit_message_rate_before_insert
  before insert on public.messages
  for each row execute function public.limit_message_rate();
