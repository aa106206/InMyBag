-- 계정 공개 범위 설정.
-- 비공개(is_private = true) 계정의 가방은 서로 친구인 사람만 볼 수 있고,
-- 둘러보기(전체 읽기) 대상에서는 빠진다.
alter table public.profiles add column if not exists is_private boolean not null default false;

-- 둘러보기용 '전체 읽기' 정책을 '공개 계정만 읽기'로 좁힌다.
-- 비공개 계정의 가방은 기존 본인/친구 읽기 정책으로만 접근할 수 있다.
drop policy if exists "Signed-in users can read all bag stacks" on public.bag_stacks;
drop policy if exists "Signed-in users can read public bag stacks" on public.bag_stacks;
create policy "Signed-in users can read public bag stacks"
  on public.bag_stacks
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = bag_stacks.user_id
        and coalesce(profiles.is_private, false) = false
    )
  );

drop policy if exists "Signed-in users can read all bag items" on public.bag_items;
drop policy if exists "Signed-in users can read public bag items" on public.bag_items;
create policy "Signed-in users can read public bag items"
  on public.bag_items
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.bag_stacks
      join public.profiles on profiles.id = bag_stacks.user_id
      where bag_stacks.id = bag_items.bag_stack_id
        and coalesce(profiles.is_private, false) = false
    )
  );

drop policy if exists "Signed-in users can read all bag item images" on storage.objects;
drop policy if exists "Signed-in users can read public bag item images" on storage.objects;
create policy "Signed-in users can read public bag item images"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'bag-items'
    and exists (
      select 1
      from public.profiles
      where profiles.id::text = split_part(name, '/', 1)
        and coalesce(profiles.is_private, false) = false
    )
  );
