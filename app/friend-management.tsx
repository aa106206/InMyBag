import { Image } from 'expo-image';
import { Stack } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import { fetchFriends, FriendProfile } from '@/services/friends';

function FriendAvatar({ friend }: { friend: FriendProfile }) {
  if (friend.avatarUrl) {
    return <Image source={{ uri: friend.avatarUrl }} style={styles.friendAvatar} contentFit="cover" />;
  }

  return (
    <View style={[styles.friendAvatar, styles.friendAvatarFallback]}>
      <Text style={styles.friendAvatarInitial}>
        {friend.username.slice(0, 1).toUpperCase()}
      </Text>
    </View>
  );
}

export default function FriendManagementScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [friends, setFriends] = useState<FriendProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [searchText, setSearchText] = useState('');

  const loadFriends = useCallback(async () => {
    if (!userId) {
      setFriends([]);
      return;
    }

    try {
      setLoadError(false);
      setFriends(await fetchFriends(userId));
    } catch (error) {
      console.warn('Failed to load friends', error);
      setLoadError(true);
    }
  }, [userId]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setIsLoading(true);
      await loadFriends();
      if (!cancelled) {
        setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadFriends]);

  const refreshFriends = useCallback(async () => {
    setIsRefreshing(true);
    await loadFriends();
    setIsRefreshing(false);
  }, [loadFriends]);

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
        <View style={styles.searchWrap}>
          <TextInput
            value={searchText}
            onChangeText={setSearchText}
            placeholder="친구 검색"
            placeholderTextColor={Brand.muted}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.searchInput}
          />
        </View>
        {isLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={Brand.primary} size="large" />
          </View>
        ) : (
          <ScrollView
            style={styles.list}
            contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 24 }]}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={isRefreshing} onRefresh={refreshFriends} />
            }
          >
            {filteredFriends.map((friend) => (
              <View key={friend.id} style={styles.friendRow}>
                <FriendAvatar friend={friend} />
                <View style={styles.friendInfo}>
                  <Text style={styles.friendUser}>@{friend.username.split('@')[0]}</Text>
                  {friend.email ? <Text style={styles.friendName}>{friend.email}</Text> : null}
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
                  : '아직 친구가 없어요.\n설정에서 친구 초대 링크를 공유해 보세요!'}
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
  searchWrap: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: Brand.secondary,
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
    paddingTop: 4,
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
  friendAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Brand.secondary,
  },
  friendAvatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Brand.primary,
  },
  friendAvatarInitial: {
    color: Brand.text,
    fontSize: 20,
    fontWeight: '900',
  },
  friendInfo: {
    flex: 1,
    gap: 2,
  },
  friendUser: {
    color: Brand.text,
    fontSize: 17,
    fontWeight: '900',
  },
  friendName: {
    color: Brand.muted,
    fontSize: 13,
    fontWeight: '800',
  },
  emptyText: {
    paddingTop: 28,
    color: Brand.muted,
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 22,
  },
});
