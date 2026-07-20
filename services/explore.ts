import { supabase } from "./supabase";

export type ExploreOwner = {
  id: string;
  username: string;
  avatarUrl: string | null;
};

function shuffle<T>(items: T[]): T[] {
  const result = [...items];

  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

// 가방에 물건이 하나라도 있는 계정을 랜덤 순서로 반환한다. (본인 제외)
// "친구가 아니어도 모든 계정"이 대상이라, bag_stacks/bag_items 전체 읽기 정책이 필요하다.
export async function fetchExploreBagOwners(excludeUserId: string): Promise<ExploreOwner[]> {
  // 1) 물건이 담긴 stack id들을 추린다.
  const { data: itemRows, error: itemsError } = await supabase
    .from("bag_items")
    .select("bag_stack_id");

  if (itemsError) {
    throw itemsError;
  }

  const stackIdsWithItems = [
    ...new Set(
      (itemRows ?? []).map((row) => row.bag_stack_id as string).filter((id): id is string => Boolean(id)),
    ),
  ];

  if (stackIdsWithItems.length === 0) {
    return [];
  }

  // 2) 그 stack들의 주인(user_id)을 모은다. (본인 제외)
  const { data: stacks, error: stacksError } = await supabase
    .from("bag_stacks")
    .select("user_id")
    .in("id", stackIdsWithItems);

  if (stacksError) {
    throw stacksError;
  }

  const ownerIds = [
    ...new Set(
      (stacks ?? [])
        .map((row) => row.user_id as string)
        .filter((id): id is string => Boolean(id) && id !== excludeUserId),
    ),
  ];

  if (ownerIds.length === 0) {
    return [];
  }

  // 3) 프로필 정보를 붙이고 랜덤 순서로 섞는다.
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, username, email, avatar_url")
    .in("id", ownerIds);

  if (profilesError) {
    throw profilesError;
  }

  const owners = (profiles ?? []).map((profile) => ({
    id: profile.id as string,
    username:
      (profile.username as string | null) ?? (profile.email as string | null) ?? "알 수 없음",
    avatarUrl: profile.avatar_url as string | null,
  }));

  return shuffle(owners);
}
