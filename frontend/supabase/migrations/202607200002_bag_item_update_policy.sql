-- SnapBag: 내 가방 사진 제목/기록 수정 허용

drop policy if exists "Users can update items in their own bag stacks" on public.bag_items;
create policy "Users can update items in their own bag stacks"
  on public.bag_items
  for update
  using (
    exists (
      select 1
      from public.bag_stacks
      where bag_stacks.id = bag_items.bag_stack_id
        and bag_stacks.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.bag_stacks
      where bag_stacks.id = bag_items.bag_stack_id
        and bag_stacks.user_id = auth.uid()
    )
  );
