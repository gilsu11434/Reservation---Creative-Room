-- 수료증 경로 저장 보장 및 관리자 승인/반려 기능을 설정합니다.
-- Supabase Dashboard > SQL Editor > New query에서 전체 내용을 한 번 실행하세요.

begin;

alter table public.reservation_members
add column if not exists certificate_review_status text not null default 'pending';

alter table public.reservation_members
add column if not exists certificate_review_note text;

alter table public.reservation_members
add column if not exists certificate_reviewed_at timestamptz;

alter table public.reservation_members
add column if not exists certificate_reviewed_by uuid references auth.users(id);

-- 기존에 이미 확인 완료된 수료증 상태를 새 승인 상태와 맞춥니다.
update public.reservation_members
set certificate_review_status = 'approved'
where certificate_verified = true
  and certificate_review_status <> 'approved';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'reservation_members_certificate_review_status_check'
      and conrelid = 'public.reservation_members'::regclass
  ) then
    alter table public.reservation_members
    add constraint reservation_members_certificate_review_status_check
    check (certificate_review_status in ('pending', 'approved', 'rejected'));
  end if;
end;
$$;

-- 사용자가 제출한 수료증 경로를 본인 예약의 참여자 행에 확실히 저장합니다.
create or replace function public.save_my_certificate_path(
  p_member_id uuid,
  p_reservation_id uuid,
  p_file_path text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if nullif(trim(coalesce(p_file_path, '')), '') is null then
    raise exception '수료증 파일 경로가 없습니다.';
  end if;

  if split_part(p_file_path, '/', 1) <> auth.uid()::text then
    raise exception '본인이 업로드한 수료증만 저장할 수 있습니다.';
  end if;

  update public.reservation_members as member
  set
    safety_certificate_path = p_file_path,
    safety_submitted_at = now(),
    certificate_verified = false,
    certificate_review_status = 'pending',
    certificate_review_note = null,
    certificate_reviewed_at = null,
    certificate_reviewed_by = null
  where member.id = p_member_id
    and member.reservation_id = p_reservation_id
    and exists (
      select 1
      from public.reservations as reservation
      join public.teams as team
        on team.id = reservation.team_id
      where reservation.id = member.reservation_id
        and team.leader_id = auth.uid()
    );

  if not found then
    raise exception '수료증을 저장할 본인 예약의 참여자 정보를 찾을 수 없습니다.';
  end if;
end;
$$;

revoke all on function public.save_my_certificate_path(uuid, uuid, text)
from public;

grant execute on function public.save_my_certificate_path(uuid, uuid, text)
to authenticated;

-- 관리자가 제출된 수료증을 승인하거나 반려합니다.
create or replace function public.admin_review_certificate(
  p_member_id uuid,
  p_decision text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.user_roles as user_role
    where user_role.user_id = auth.uid()
      and user_role.role::text = 'admin'
  ) then
    raise exception '관리자만 수료증을 승인할 수 있습니다.';
  end if;

  if p_decision not in ('approved', 'rejected') then
    raise exception '승인 또는 반려 상태가 올바르지 않습니다.';
  end if;

  update public.reservation_members
  set
    certificate_review_status = p_decision,
    certificate_verified = (p_decision = 'approved'),
    certificate_review_note = nullif(trim(coalesce(p_note, '')), ''),
    certificate_reviewed_at = now(),
    certificate_reviewed_by = auth.uid()
  where id = p_member_id
    and safety_certificate_path is not null;

  if not found then
    raise exception '제출된 수료증을 찾을 수 없습니다.';
  end if;
end;
$$;

revoke all on function public.admin_review_certificate(uuid, text, text)
from public;

grant execute on function public.admin_review_certificate(uuid, text, text)
to authenticated;

commit;

-- 확인용: 아래 결과에 certificate_review_status가 보이면 정상입니다.
select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'reservation_members'
  and column_name in (
    'certificate_review_status',
    'certificate_review_note',
    'certificate_reviewed_at',
    'certificate_reviewed_by'
  )
order by column_name;
