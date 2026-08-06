-- 건의사항 게시판에 필요한 테이블과 접근 권한을 생성합니다.
-- Supabase Dashboard > SQL Editor에서 전체 내용을 한 번 실행하세요.

create table if not exists public.suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null,
  title text not null,
  content text not null,
  created_at timestamptz not null default now(),
  constraint suggestions_title_length
    check (char_length(trim(title)) between 1 and 100),
  constraint suggestions_content_length
    check (char_length(trim(content)) between 1 and 2000)
);

create index if not exists suggestions_created_at_idx
on public.suggestions (created_at desc);

alter table public.suggestions enable row level security;

-- 작성자를 브라우저 입력값으로 받지 않고 로그인 회원정보에서 자동 저장합니다.
create or replace function public.prepare_suggestion_author()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;

  new.user_id := auth.uid();
  new.author_name := coalesce(
    (
      select nullif(trim(profile.full_name), '')
      from public.profiles as profile
      where profile.id = auth.uid()
    ),
    '이용자'
  );
  new.title := trim(new.title);
  new.content := trim(new.content);

  return new;
end;
$$;

drop trigger if exists trigger_prepare_suggestion_author
on public.suggestions;

create trigger trigger_prepare_suggestion_author
before insert on public.suggestions
for each row
execute function public.prepare_suggestion_author();

drop policy if exists "suggestions_read_all"
on public.suggestions;

create policy "suggestions_read_all"
on public.suggestions
for select
to anon, authenticated
using (true);

drop policy if exists "suggestions_insert_authenticated"
on public.suggestions;

create policy "suggestions_insert_authenticated"
on public.suggestions
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "suggestions_delete_owner_or_admin"
on public.suggestions;

create policy "suggestions_delete_owner_or_admin"
on public.suggestions
for delete
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.user_roles as user_role
    where user_role.user_id = auth.uid()
      and user_role.role::text = 'admin'
  )
);

revoke all on table public.suggestions from anon, authenticated;
grant select on table public.suggestions to anon, authenticated;
grant insert, delete on table public.suggestions to authenticated;
