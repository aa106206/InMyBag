import { supabase } from "./supabase";

export type FriendProfile = {
  id: string;
  username: string;
  email: string | null;
  avatarUrl: string | null;
  friendedAt: string;
};

export type AcceptInviteResult = {
  friendId: string;
  friendName: string;
  alreadyFriends: boolean;
};

export async function fetchFriends(userId: string): Promise<FriendProfile[]> {
  const { data: friendships, error: friendshipsError } = await supabase
    .from("friendships")
    .select("friend_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (friendshipsError) {
    throw friendshipsError;
  }

  if (!friendships || friendships.length === 0) {
    return [];
  }

  const friendedAtById = new Map(
    friendships.map((row) => [row.friend_id as string, row.created_at as string]),
  );

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, username, email, avatar_url")
    .in("id", [...friendedAtById.keys()]);

  if (profilesError) {
    throw profilesError;
  }

  return (profiles ?? [])
    .map((profile) => ({
      id: profile.id as string,
      username: (profile.username as string | null) ?? (profile.email as string | null) ?? "알 수 없음",
      email: profile.email as string | null,
      avatarUrl: profile.avatar_url as string | null,
      friendedAt: friendedAtById.get(profile.id as string) ?? "",
    }))
    .sort((a, b) => (a.friendedAt < b.friendedAt ? 1 : -1));
}

export async function acceptFriendInvite(inviterId: string): Promise<AcceptInviteResult> {
  const { data, error } = await supabase.rpc("accept_friend_invite", {
    inviter: inviterId,
  });

  if (error) {
    throw error;
  }

  return {
    friendId: data.friend_id,
    friendName: data.friend_name,
    alreadyFriends: Boolean(data.already_friends),
  };
}
