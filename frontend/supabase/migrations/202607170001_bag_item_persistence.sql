-- SnapBag: SAM2로 분리한 객체를 DB와 Storage에 저장하기 위한 마이그레이션
-- Supabase Dashboard > SQL Editor에서 실행해도 됩니다.

alter table public.bag_items
  add column if not exists storage_path text,
  add column if not exists width integer,
  add column if not exists height integer,
  add column if not exists object_label text,
  add column if not exists note text,
  add column if not exists location_name text,
  add column if not exists location_latitude double precision,
  add column if not exists location_longitude double precision;

alter table public.bag_items enable row level security;

alter table public.profiles enable row level security;
alter table public.bag_stacks enable row level security;

drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile"
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists "Users can read their own bag stacks" on public.bag_stacks;
create policy "Users can read their own bag stacks"
  on public.bag_stacks
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own bag stacks" on public.bag_stacks;
create policy "Users can insert their own bag stacks"
  on public.bag_stacks
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can read items from their own bag stacks" on public.bag_items;
create policy "Users can read items from their own bag stacks"
  on public.bag_items
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.bag_stacks
      where bag_stacks.id = bag_items.bag_stack_id
        and bag_stacks.user_id = auth.uid()
    )
  );

drop policy if exists "Users can insert items into their own bag stacks" on public.bag_items;
create policy "Users can insert items into their own bag stacks"
  on public.bag_items
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.bag_stacks
      where bag_stacks.id = bag_items.bag_stack_id
        and bag_stacks.user_id = auth.uid()
    )
  );

drop policy if exists "Users can delete items from their own bag stacks" on public.bag_items;
create policy "Users can delete items from their own bag stacks"
  on public.bag_items
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.bag_stacks
      where bag_stacks.id = bag_items.bag_stack_id
        and bag_stacks.user_id = auth.uid()
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'bag-items',
  'bag-items',
  false,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users can upload their own bag item images" on storage.objects;
create policy "Users can upload their own bag item images"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'bag-items'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can delete their own bag item images" on storage.objects;
create policy "Users can delete their own bag item images"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'bag-items'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- 이미지는 private 버킷에 두고, 본인과 친구만 signed URL을 발급받을 수 있다.
drop policy if exists "Users can read their own bag item images" on storage.objects;
drop policy if exists "Users and friends can read bag item images" on storage.objects;
create policy "Users and friends can read bag item images"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'bag-items'
    and (
      auth.uid()::text = (storage.foldername(name))[1]
      or exists (
        select 1
        from public.friendships
        where friendships.user_id = auth.uid()
          and friendships.friend_id::text = (storage.foldername(name))[1]
      )
    )
  );
