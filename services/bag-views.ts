import { supabase } from "./supabase";
import { resolveProfileAvatarUrl } from "./profile";

export type BagView = {
  viewerId: string;
  viewerName: string;
  viewerEmail: string | null;
  viewerAvatarUrl: string | null;
  viewedAt: string;
};

// 피드에서 친구 가방을 봤을 때 조회 기록을 남긴다.
// 같은 사람이 여러 번 봐도 행이 늘지 않고 viewed_at만 최신으로 갱신된다.
export async function recordBagView(ownerId: string): Promise<void> {
  const { error } = await supabase.rpc("record_bag_view", { owner: ownerId });

  if (error) {
    throw error;
  }
}

// 내 가방을 조회한 사람 목록(최근 조회순).
export async function fetchBagViews(ownerId: string): Promise<BagView[]> {
  const { data: views, error } = await supabase
    .from("bag_views")
    .select("viewer_id, viewed_at")
    .eq("owner_id", ownerId)
    .order("viewed_at", { ascending: false });

  if (error) {
    throw error;
  }

  if (!views || views.length === 0) {
    return [];
  }

  const viewerIds = [...new Set(views.map((row) => row.viewer_id as string))];
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, username, email, avatar_url")
    .in("id", viewerIds);

  if (profilesError) {
    throw profilesError;
  }

  const profileById = new Map((profiles ?? []).map((profile) => [profile.id as string, profile]));

  return Promise.all(views.map(async (row) => {
    const profile = profileById.get(row.viewer_id as string);

    return {
      viewerId: row.viewer_id as string,
      viewerName:
        (profile?.username as string | null) ?? (profile?.email as string | null) ?? "알 수 없음",
      viewerEmail: (profile?.email as string | null) ?? null,
      viewerAvatarUrl: await resolveProfileAvatarUrl((profile?.avatar_url as string | null) ?? null),
      viewedAt: row.viewed_at as string,
    };
  }));
}
