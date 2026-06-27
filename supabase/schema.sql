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
  width integer,
  height integer,
  x numeric,
  y numeric,
  rotation numeric,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.bag_stacks enable row level security;
alter table public.bag_items enable row level security;

create policy "Profiles are readable by everyone"
  on public.profiles
  for select
  using (true);

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
