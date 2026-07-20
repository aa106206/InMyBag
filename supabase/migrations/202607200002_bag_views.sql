-- SnapBag: 내 가방을 누가 조회했는지 기록/조회하는 기능
-- 피드에서 친구 가방을 열어볼 때 record_bag_view RPC로 기록을 남기고,
-- 가방 화면의 "조회" 버튼에서 owner 본인이 조회 목록을 읽는다.
-- Supabase Dashboard > SQL Editor에서 실행해도 됩니다. (여러 번 실행해도 안전)

create table if not exists public.bag_views (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (owner_id, viewer_id),
  check (owner_id <> viewer_id)
);

-- 최근 조회순 정렬을 빠르게 하기 위한 인덱스
create index if not exists bag_views_owner_viewed_at_idx
  on public.bag_views (owner_id, viewed_at desc);

alter table public.bag_views enable row level security;

-- 가방 주인만 자기 가방의 조회 기록을 읽을 수 있다. (쓰기는 아래 RPC로만)
drop policy if exists "Owners can read their bag views" on public.bag_views;
create policy "Owners can read their bag views"
  on public.bag_views
  for select
  to authenticated
  using (auth.uid() = owner_id);

-- 조회 기록 남기기: 로그인한 사용자가 owner의 가방을 봤음을 기록한다.
-- 같은 사람이 여러 번 봐도 행이 늘지 않고 viewed_at만 최신으로 갱신된다.
-- security definer라 RLS를 우회해 insert/update 한다.
create or replace function public.record_bag_view(owner uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  viewer uuid := auth.uid();
begin
  if viewer is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  -- 대상이 없거나 본인 가방이면 기록하지 않는다.
  if owner is null or owner = viewer then
    return;
  end if;

  insert into public.bag_views (owner_id, viewer_id, viewed_at)
  values (owner, viewer, now())
  on conflict (owner_id, viewer_id)
  do update set viewed_at = now();
end;
$$;

revoke execute on function public.record_bag_view(uuid) from public, anon;
grant execute on function public.record_bag_view(uuid) to authenticated;
