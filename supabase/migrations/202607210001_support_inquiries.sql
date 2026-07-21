create table if not exists public.support_inquiries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text,
  message text not null check (
    char_length(trim(message)) > 0
    and char_length(message) <= 120
  ),
  created_at timestamptz not null default now()
);

alter table public.support_inquiries enable row level security;

drop policy if exists "Users can insert their own support inquiries" on public.support_inquiries;
drop policy if exists "Users can read their own support inquiries" on public.support_inquiries;

create policy "Users can insert their own support inquiries"
  on public.support_inquiries
  for insert
  with check (auth.uid() = user_id);

create policy "Users can read their own support inquiries"
  on public.support_inquiries
  for select
  using (auth.uid() = user_id);
