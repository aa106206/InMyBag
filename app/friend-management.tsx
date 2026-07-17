import { Image } from 'expo-image';
import { Stack } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Brand } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import {
  fetchFriends,
  fetchIncomingFriendRequests,
  FriendProfile,
  FriendRequest,
  getFriendRequestErrorMessage,
  respondFriendRequest,
  sendFriendRequest,
} from '@/services/friends';

function AvatarCircle({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  if (avatarUrl) {
    return <Image source={{ uri: avatarUrl }} style={styles.avatar} contentFit="cover" />;
  }

  return (
    <View style={[styles.avatar, styles.avatarFallback]}>
      <Text style={styles.avatarInitial}>{name.slice(0, 1).toUpperCase()}</Text>
    </View>
  );
}

export default function FriendManagementScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [friends, setFriends] = useState<FriendProfile[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<FriendRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [addTarget, setAddTarget] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [respondingRequestId, setRespondingRequestId] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    if (!userId) {
      setFriends([]);
      setIncomingRequests([]);
      return;
    }

    try {
      setLoadError(false);
      const [nextFriends, nextRequests] = await Promise.all([
        fetchFriends(userId),
        fetchIncomingFriendRequests(userId),
      ]);
      setFriends(nextFriends);
      setIncomingRequests(nextRequests);
    } catch (error) {
      console.warn('Failed to load friends data', error);
      setLoadError(true);
    }
  }, [userId]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setIsLoading(true);
      await loadAll();
      if (!cancelled) {
        setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadAll]);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadAll();
    setIsRefreshing(false);
  }, [loadAll]);

  const submitFriendRequest = useCallback(async () => {
    const target = addTarget.trim();
    if (!target || isSending) {
      return;
    }

    setIsSending(true);
    try {
      const result = await sendFriendRequest(target);

      if (result.result === 'accepted_existing') {
        Alert.alert(
          '친구 추가 완료',
          `${result.friendName}님도 나에게 친구 요청을 보낸 상태여서 바로 친구가 되었어요!`,
        );
      } else {
        Alert.alert('요청 전송 완료', `${result.friendName}님에게 친구 요청을 보냈어요.`);
      }

      setAddTarget('');
      await loadAll();
    } catch (error) {
      Alert.alert('친구 요청 실패', getFriendRequestErrorMessage(error));
    } finally {
      setIsSending(false);
    }
  }, [addTarget, isSending, loadAll]);

  const respondToRequest = useCallback(
    async (request: FriendRequest, accept: boolean) => {
      if (respondingRequestId) {
        return;
      }

      setRespondingRequestId(request.id);
      try {
        const result = await respondFriendRequest(request.id, accept);

        if (result.result === 'accepted') {
          Alert.alert('친구 추가 완료', `${result.friendName}님과 친구가 되었어요!`);
        }

        await loadAll();
      } catch (error) {
        Alert.alert('요청 처리 실패', getFriendRequestErrorMessage(error));
      } finally {
        setRespondingRequestId(null);
      }
    },
    [loadAll, respondingRequestId],
  );

  const normalizedSearch = searchText.trim().toLowerCase();
  const filteredFriends = useMemo(
    () =>
      normalizedSearch
        ? friends.filter(
            (friend) =>
              friend.username.toLowerCase().includes(normalizedSearch) ||
              (friend.email ?? '').toLowerCase().includes(normalizedSearch),
          )
        : friends,
    [friends, normalizedSearch],
  );

  return (
    <>
      <Stack.Screen options={{ title: '친구 관리' }} />
      <View style={styles.screen}>
        {isLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={Brand.primary} size="large" />
          </View>
        ) : (
          <ScrollView
            style={styles.list}
            contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 24 }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} />}
          >
            <Text style={styles.sectionTitle}>친구 추가</Text>
            <View style={styles.addRow}>
              <TextInput
                value={addTarget}
                onChangeText={setAddTarget}
                placeholder="친구 아이디(이메일) 입력"
                placeholderTextColor={Brand.muted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                editable={!isSending}
                style={styles.addInput}
                onSubmitEditing={submitFriendRequest}
                returnKeyType="send"
              />
              <Pressable
                style={({ pressed }) => [
                  styles.addButton,
                  pressed ? styles.addButtonPressed : undefined,
                  isSending || !addTarget.trim() ? styles.addButtonDisabled : undefined,
                ]}
                onPress={submitFriendRequest}
                disabled={isSending || !addTarget.trim()}
              >
                {isSending ? (
                  <ActivityIndicator color={Brand.text} size="small" />
                ) : (
                  <Text style={styles.addButtonText}>요청</Text>
                )}
              </Pressable>
            </View>

            {incomingRequests.length > 0 ? (
              <>
                <Text style={styles.sectionTitle}>받은 친구 요청</Text>
                {incomingRequests.map((request) => (
                  <View key={request.id} style={styles.requestRow}>
                    <AvatarCircle
                      name={request.requesterName}
                      avatarUrl={request.requesterAvatarUrl}
                    />
                    <View style={styles.rowInfo}>
                      <Text style={styles.rowTitle}>@{request.requesterName.split('@')[0]}</Text>
                      {request.requesterEmail ? (
                        <Text style={styles.rowSubtitle}>{request.requesterEmail}</Text>
                      ) : null}
                    </View>
                    <View style={styles.requestActions}>
                      <Pressable
                        style={[
                          styles.requestButton,
                          styles.acceptButton,
                          respondingRequestId === request.id ? styles.requestButtonDisabled : undefined,
                        ]}
                        onPress={() => respondToRequest(request, true)}
                        disabled={respondingRequestId !== null}
                      >
                        <Text style={styles.acceptButtonText}>수락</Text>
                      </Pressable>
                      <Pressable
                        style={[
                          styles.requestButton,
                          styles.declineButton,
                          respondingRequestId === request.id ? styles.requestButtonDisabled : undefined,
                        ]}
                        onPress={() => respondToRequest(request, false)}
                        disabled={respondingRequestId !== null}
                      >
                        <Text style={styles.declineButtonText}>거절</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </>
            ) : null}

            <Text style={styles.sectionTitle}>내 친구 {friends.length > 0 ? `(${friends.length})` : ''}</Text>
            <TextInput
              value={searchText}
              onChangeText={setSearchText}
              placeholder="친구 검색"
              placeholderTextColor={Brand.muted}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.searchInput}
            />
            {filteredFriends.map((friend) => (
              <View key={friend.id} style={styles.friendRow}>
                <AvatarCircle name={friend.username} avatarUrl={friend.avatarUrl} />
                <View style={styles.rowInfo}>
                  <Text style={styles.rowTitle}>@{friend.username.split('@')[0]}</Text>
                  {friend.email ? <Text style={styles.rowSubtitle}>{friend.email}</Text> : null}
                </View>
              </View>
            ))}
            {loadError ? (
              <Text style={styles.emptyText}>
                친구 목록을 불러오지 못했어요. 아래로 당겨서 다시 시도해 주세요.
              </Text>
            ) : filteredFriends.length === 0 ? (
              <Text style={styles.emptyText}>
                {normalizedSearch
                  ? '검색 결과가 없습니다.'
                  : '아직 친구가 없어요.\n위에서 친구 아이디로 요청을 보내보세요!'}
              </Text>
            ) : null}
          </ScrollView>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Brand.secondary,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    flex: 1,
  },
  listContent: {
    gap: 10,
    paddingHorizontal: 18,
    paddingTop: 12,
  },
  sectionTitle: {
    marginTop: 8,
    color: Brand.text,
    fontSize: 16,
    fontWeight: '900',
  },
  addRow: {
    flexDirection: 'row',
    gap: 8,
  },
  addInput: {
    flex: 1,
    height: 50,
    borderRadius: 8,
    paddingHorizontal: 16,
    color: Brand.text,
    fontSize: 15,
    fontWeight: '800',
    backgroundColor: Brand.surface,
    borderWidth: 1,
    borderColor: Brand.border,
  },
  addButton: {
    minWidth: 74,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: Brand.primary,
  },
  addButtonPressed: {
    opacity: 0.8,
  },
  addButtonDisabled: {
    opacity: 0.55,
  },
  addButtonText: {
    color: Brand.text,
    fontSize: 15,
    fontWeight: '900',
  },
  searchInput: {
    height: 50,
    borderRadius: 8,
    paddingHorizontal: 16,
    color: Brand.text,
    fontSize: 15,
    fontWeight: '800',
    backgroundColor: Brand.surface,
    borderWidth: 1,
    borderColor: Brand.border,
  },
  requestRow: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: Brand.surface,
    borderWidth: 1,
    borderColor: Brand.primary,
  },
  friendRow: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: Brand.surface,
    borderWidth: 1,
    borderColor: Brand.border,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Brand.secondary,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Brand.primary,
  },
  avatarInitial: {
    color: Brand.text,
    fontSize: 20,
    fontWeight: '900',
  },
  rowInfo: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    color: Brand.text,
    fontSize: 16,
    fontWeight: '900',
  },
  rowSubtitle: {
    color: Brand.muted,
    fontSize: 12,
    fontWeight: '800',
  },
  requestActions: {
    flexDirection: 'row',
    gap: 6,
  },
  requestButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
  },
  requestButtonDisabled: {
    opacity: 0.55,
  },
  acceptButton: {
    backgroundColor: Brand.primary,
  },
  acceptButtonText: {
    color: Brand.text,
    fontSize: 13,
    fontWeight: '900',
  },
  declineButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: Brand.border,
  },
  declineButtonText: {
    color: Brand.muted,
    fontSize: 13,
    fontWeight: '900',
  },
  emptyText: {
    paddingTop: 20,
    color: Brand.muted,
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 22,
  },
});
