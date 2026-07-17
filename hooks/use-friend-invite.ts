import * as Linking from "expo-linking";
import { router } from "expo-router";
import { useEffect, useRef } from "react";
import { Alert } from "react-native";

import { useAuth } from "@/hooks/use-auth";
import { acceptFriendInvite } from "@/services/friends";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getInviteCodeFromUrl(url: string): string | null {
  const parsed = Linking.parse(url);
  const isInviteLink = parsed.path === "invite" || parsed.hostname === "invite";

  if (!isInviteLink) {
    return null;
  }

  const code = parsed.queryParams?.code;
  return typeof code === "string" && UUID_PATTERN.test(code) ? code : null;
}

/**
 * 친구 초대 딥링크(snapbag://invite?code=<user_id>)를 감지해서 친구 관계를 만든다.
 * 로그인 전에 링크로 앱이 열리면 URL을 들고 있다가 로그인 완료 후 처리된다.
 */
export function useFriendInviteLink() {
  const url = Linking.useURL();
  const { user } = useAuth();
  const handledKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!url || !user) {
      return;
    }

    const inviteCode = getInviteCodeFromUrl(url);
    if (!inviteCode) {
      return;
    }

    const handledKey = `${user.id}:${url}`;
    if (handledKeyRef.current === handledKey) {
      return;
    }
    handledKeyRef.current = handledKey;

    if (inviteCode === user.id) {
      Alert.alert("친구 초대", "자기 자신은 친구로 추가할 수 없어요.");
      return;
    }

    acceptFriendInvite(inviteCode)
      .then((result) => {
        if (result.alreadyFriends) {
          Alert.alert("친구 초대", `${result.friendName}님과는 이미 친구예요.`);
          return;
        }

        Alert.alert("친구 추가 완료", `${result.friendName}님과 친구가 되었어요!`, [
          { text: "닫기", style: "cancel" },
          { text: "친구 목록 보기", onPress: () => router.push("/friend-management") },
        ]);
      })
      .catch((error) => {
        console.warn("Failed to accept friend invite", error);
        Alert.alert(
          "친구 추가 실패",
          "초대 링크를 처리하지 못했어요. 링크가 유효한지 확인하고 다시 시도해 주세요.",
        );
      });
  }, [url, user]);
}
