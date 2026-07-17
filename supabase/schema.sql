create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  username text unique,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists email text unique;

create table if not exists public.bag_stacks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default 'My Bag',
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bag_items (
  id uuid primary key default gen_random_uuid(),
  bag_stack_id uuid not null references public.bag_stacks(id) on delete cascade,
  image_url text not null,
  storage_path text,
  width integer,
  height integer,
  x numeric,
  y numeric,
  rotation numeric,
  created_at timestamptz not null default now()
);

alter table public.bag_items add column if not exists storage_path text;

alter table public.profiles enable row level security;
alter table public.bag_stacks enable row level security;
alter table public.bag_items enable row level security;

drop policy if exists "Profiles are readable by everyone" on public.profiles;
drop policy if exists "Users can insert their own profile" on public.profiles;
drop policy if exists "Users can update their own profile" on public.profiles;
drop policy if exists "Users can read their own bag stacks" on public.bag_stacks;
drop policy if exists "Users can insert their own bag stacks" on public.bag_stacks;
drop policy if exists "Users can update their own bag stacks" on public.bag_stacks;
drop policy if exists "Users can delete their own bag stacks" on public.bag_stacks;
drop policy if exists "Users can read items from their own bag stacks" on public.bag_items;
drop policy if exists "Users can insert items into their own bag stacks" on public.bag_items;
drop policy if exists "Users can delete items from their own bag stacks" on public.bag_items;

create policy "Profiles are readable by everyone"
  on public.profiles
  for select
  using (true);

create policy "Users can insert their own profile"
  on public.profiles
  for insert
  with check (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "Users can read their own bag stacks"
  on public.bag_stacks
  for select
  using (auth.uid() = user_id);

create policy "Users can insert their own bag stacks"
  on public.bag_stacks
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own bag stacks"
  on public.bag_stacks
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own bag stacks"
  on public.bag_stacks
  for delete
  using (auth.uid() = user_id);

create policy "Users can read items from their own bag stacks"
  on public.bag_items
  for select
  using (
    exists (
      select 1
      from public.bag_stacks
      where bag_stacks.id = bag_items.bag_stack_id
        and bag_stacks.user_id = auth.uid()
    )
  );

create policy "Users can insert items into their own bag stacks"
  on public.bag_items
  for insert
  with check (
    exists (
      select 1
      from public.bag_stacks
      where bag_stacks.id = bag_items.bag_stack_id
        and bag_stacks.user_id = auth.uid()
    )
  );

create policy "Users can delete items from their own bag stacks"
  on public.bag_items
  for delete
  using (
    exists (
      select 1
      from public.bag_stacks
      where bag_stacks.id = bag_items.bag_stack_id
        and bag_stacks.user_id = auth.uid()
    )
  );

insert into storage.buckets (id, name, public)
values ('bag-items', 'bag-items', false)
on conflict (id) do update set public = excluded.public;

drop policy if exists "Users can read their own bag item images" on storage.objects;
drop policy if exists "Users can upload their own bag item images" on storage.objects;
drop policy if exists "Users can delete their own bag item images" on storage.objects;

create policy "Users can read their own bag item images"
  on storage.objects
  for select
  using (
    bucket_id = 'bag-items'
    and auth.uid()::text = split_part(name, '/', 1)
  );

create policy "Users can upload their own bag item images"
  on storage.objects
  for insert
  with check (
    bucket_id = 'bag-items'
    and auth.uid()::text = split_part(name, '/', 1)
  );

create policy "Users can delete their own bag item images"
  on storage.objects
  for delete
  using (
    bucket_id = 'bag-items'
    and auth.uid()::text = split_part(name, '/', 1)
  );

create table if not exists public.friendships (
  user_id uuid not null references public.profiles(id) on delete cascade,
  friend_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);

alter table public.friendships enable row level security;

drop policy if exists "Users can read their own friendships" on public.friendships;
create policy "Users can read their own friendships"
  on public.friendships
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can delete their own friendships" on public.friendships;
create policy "Users can delete their own friendships"
  on public.friendships
  for delete
  using (auth.uid() = user_id);

-- 이전 링크 초대 방식은 제거됐다.
drop function if exists public.accept_friend_invite(uuid);

create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_id <> recipient_id)
);

-- 같은 상대에게 보류 중인 요청은 하나만 존재할 수 있다.
create unique index if not exists friend_requests_pending_unique
  on public.friend_requests (requester_id, recipient_id)
  where status = 'pending';

alter table public.friend_requests enable row level security;

drop policy if exists "Users can read their own friend requests" on public.friend_requests;
create policy "Users can read their own friend requests"
  on public.friend_requests
  for select
  using (auth.uid() = requester_id or auth.uid() = recipient_id);

-- 친구 요청 전송: 아이디(username 또는 email)로 상대를 찾아 요청을 만든다.
-- 상대가 나에게 먼저 보낸 대기 중 요청이 있으면 그 요청을 수락 처리하고 바로 친구가 된다.
-- friend_requests에는 insert/update 정책이 없으므로 요청 생성과 응답은 RPC로만 가능하다.
create or replace function public.send_friend_request(target text)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  sender uuid := auth.uid();
  target_profile record;
  reverse_request_id uuid;
begin
  if sender is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select id, username, email
    into target_profile
    from public.profiles
   where username = target or email = target
   limit 1;

  if not found then
    raise exception 'USER_NOT_FOUND';
  end if;

  if target_profile.id = sender then
    raise exception 'SELF_REQUEST';
  end if;

  if exists (
    select 1 from public.friendships
    where user_id = sender and friend_id = target_profile.id
  ) then
    raise exception 'ALREADY_FRIENDS';
  end if;

  if exists (
    select 1 from public.friend_requests
    where requester_id = sender
      and recipient_id = target_profile.id
      and status = 'pending'
  ) then
    raise exception 'ALREADY_REQUESTED';
  end if;

  select id
    into reverse_request_id
    from public.friend_requests
   where requester_id = target_profile.id
     and recipient_id = sender
     and status = 'pending'
   limit 1;

  if reverse_request_id is not null then
    update public.friend_requests
       set status = 'accepted', responded_at = now()
     where id = reverse_request_id;

    insert into public.friendships (user_id, friend_id)
    values (sender, target_profile.id), (target_profile.id, sender)
    on conflict do nothing;

    return json_build_object(
      'result', 'accepted_existing',
      'friend_name', coalesce(target_profile.username, target_profile.email)
    );
  end if;

  insert into public.friend_requests (requester_id, recipient_id)
  values (sender, target_profile.id);

  return json_build_object(
    'result', 'requested',
    'friend_name', coalesce(target_profile.username, target_profile.email)
  );
end;
$$;

revoke execute on function public.send_friend_request(text) from public, anon;
grant execute on function public.send_friend_request(text) to authenticated;

-- 받은 친구 요청에 응답한다. 수락하면 양방향 친구 관계가 만들어진다.
create or replace function public.respond_friend_request(request_id uuid, accept boolean)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  responder uuid := auth.uid();
  req record;
  requester_profile record;
begin
  if responder is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select *
    into req
    from public.friend_requests
   where id = request_id
     and recipient_id = responder
     and status = 'pending'
   for update;

  if not found then
    raise exception 'REQUEST_NOT_FOUND';
  end if;

  update public.friend_requests
     set status = case when accept then 'accepted' else 'declined' end,
         responded_at = now()
   where id = req.id;

  if accept then
    insert into public.friendships (user_id, friend_id)
    values (responder, req.requester_id), (req.requester_id, responder)
    on conflict do nothing;
  end if;

  select username, email
    into requester_profile
    from public.profiles
   where id = req.requester_id;

  return json_build_object(
    'result', case when accept then 'accepted' else 'declined' end,
    'friend_name', coalesce(requester_profile.username, requester_profile.email)
  );
end;
$$;

revoke execute on function public.respond_friend_request(uuid, boolean) from public, anon;
grant execute on function public.respond_friend_request(uuid, boolean) to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, username, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'username', new.email),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
