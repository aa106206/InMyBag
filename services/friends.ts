import { supabase } from "./supabase";

export type FriendProfile = {
  id: string;
  username: string;
  email: string | null;
  avatarUrl: string | null;
  friendedAt: string;
};

export type FriendRequest = {
  id: string;
  requesterId: string;
  requesterName: string;
  requesterEmail: string | null;
  requesterAvatarUrl: string | null;
  createdAt: string;
};

export type SendFriendRequestResult = {
  // 'requested': 요청 전송됨, 'accepted_existing': 상대가 먼저 보낸 요청이 있어 바로 친구가 됨
  result: "requested" | "accepted_existing";
  friendName: string;
};

export type RespondFriendRequestResult = {
  result: "accepted" | "declined";
  friendName: string;
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

export async function fetchIncomingFriendRequests(userId: string): Promise<FriendRequest[]> {
  const { data: requests, error: requestsError } = await supabase
    .from("friend_requests")
    .select("id, requester_id, created_at")
    .eq("recipient_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (requestsError) {
    throw requestsError;
  }

  if (!requests || requests.length === 0) {
    return [];
  }

  const requesterIds = [...new Set(requests.map((row) => row.requester_id as string))];
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, username, email, avatar_url")
    .in("id", requesterIds);

  if (profilesError) {
    throw profilesError;
  }

  const profileById = new Map((profiles ?? []).map((profile) => [profile.id as string, profile]));

  return requests.map((row) => {
    const profile = profileById.get(row.requester_id as string);

    return {
      id: row.id as string,
      requesterId: row.requester_id as string,
      requesterName:
        (profile?.username as string | null) ?? (profile?.email as string | null) ?? "알 수 없음",
      requesterEmail: (profile?.email as string | null) ?? null,
      requesterAvatarUrl: (profile?.avatar_url as string | null) ?? null,
      createdAt: row.created_at as string,
    };
  });
}

export async function sendFriendRequest(target: string): Promise<SendFriendRequestResult> {
  const { data, error } = await supabase.rpc("send_friend_request", {
    target: target.trim(),
  });

  if (error) {
    throw error;
  }

  return {
    result: data.result,
    friendName: data.friend_name,
  };
}

export async function respondFriendRequest(
  requestId: string,
  accept: boolean,
): Promise<RespondFriendRequestResult> {
  const { data, error } = await supabase.rpc("respond_friend_request", {
    request_id: requestId,
    accept,
  });

  if (error) {
    throw error;
  }

  return {
    result: data.result,
    friendName: data.friend_name,
  };
}

const SEND_ERROR_MESSAGES: Record<string, string> = {
  USER_NOT_FOUND: "해당 아이디의 사용자를 찾을 수 없어요.",
  SELF_REQUEST: "자기 자신에게는 친구 요청을 보낼 수 없어요.",
  ALREADY_FRIENDS: "이미 친구인 계정이에요.",
  ALREADY_REQUESTED: "이미 친구 요청을 보낸 계정이에요.",
  REQUEST_NOT_FOUND: "이미 처리됐거나 존재하지 않는 요청이에요.",
};

export function getFriendRequestErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  for (const [code, koreanMessage] of Object.entries(SEND_ERROR_MESSAGES)) {
    if (message.includes(code)) {
      return koreanMessage;
    }
  }

  return "요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.";
}
