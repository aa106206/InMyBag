import { supabase } from "./supabase";
import { resolveProfileAvatarUrl } from "./profile";

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
  // 비공개 계정은 친구 여부와 상관없이 둘러보기에서 빠진다.
  let { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, username, email, avatar_url, is_private")
    .in("id", ownerIds);

  // is_private 마이그레이션을 아직 적용하지 않은 DB에서는 기존 컬럼만 다시 조회한다.
  if (
    profilesError
    && (profilesError.code === "42703" || profilesError.message?.includes("is_private"))
  ) {
    const legacy = await supabase
      .from("profiles")
      .select("id, username, email, avatar_url")
      .in("id", ownerIds);

    profiles = (legacy.data ?? []).map((profile) => ({ ...profile, is_private: false }));
    profilesError = legacy.error;
  }

  if (profilesError) {
    throw profilesError;
  }

  const publicProfiles = (profiles ?? []).filter(
    (profile) => !((profile as { is_private?: boolean | null }).is_private ?? false),
  );

  const owners = await Promise.all(publicProfiles.map(async (profile) => ({
    id: profile.id as string,
    username:
      (profile.username as string | null) ?? (profile.email as string | null) ?? "알 수 없음",
    avatarUrl: await resolveProfileAvatarUrl(profile.avatar_url as string | null),
  })));

  return shuffle(owners);
}
