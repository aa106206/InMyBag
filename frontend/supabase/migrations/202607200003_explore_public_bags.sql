-- SnapBag: 둘러보기(Explore) 화면 — 친구가 아니어도 모든 계정의 가방을 볼 수 있게 한다.
-- 로그인한 사용자라면 누구나 모든 가방(스택/아이템/이미지)을 "읽기"만 할 수 있도록 정책을 추가한다.
-- 기존 "친구만 읽기" 정책은 그대로 두고, 더 넓은 읽기 정책을 추가하는 방식이라 안전하다.
-- (insert/update/delete 권한은 그대로 본인만 가능하다.)
-- Supabase Dashboard > SQL Editor에서 실행해도 됩니다. (여러 번 실행해도 안전)

drop policy if exists "Signed-in users can read all bag stacks" on public.bag_stacks;
create policy "Signed-in users can read all bag stacks"
  on public.bag_stacks
  for select
  to authenticated
  using (true);

drop policy if exists "Signed-in users can read all bag items" on public.bag_items;
create policy "Signed-in users can read all bag items"
  on public.bag_items
  for select
  to authenticated
  using (true);

-- 이미지(비공개 버킷)의 signed URL을 만들려면 storage.objects에 대한 select 권한이 필요하다.
drop policy if exists "Signed-in users can read all bag item images" on storage.objects;
create policy "Signed-in users can read all bag item images"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'bag-items');
