create or replace function public.remove_friend(friend_user_id uuid)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  removed_count integer;
begin
  if current_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if friend_user_id = current_user_id then
    raise exception 'SELF_REMOVE';
  end if;

  delete from public.friendships
   where (user_id = current_user_id and friend_id = friend_user_id)
      or (user_id = friend_user_id and friend_id = current_user_id);

  get diagnostics removed_count = row_count;

  if removed_count = 0 then
    raise exception 'FRIENDSHIP_NOT_FOUND';
  end if;

  return json_build_object('removed', true);
end;
$$;

revoke execute on function public.remove_friend(uuid) from public, anon;
grant execute on function public.remove_friend(uuid) to authenticated;
