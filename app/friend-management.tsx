import { Image } from 'expo-image';
import { Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Brand } from '@/constants/theme';

type Friend = {
  id: string;
  user: string;
  name: string;
  avatar: string;
};

const friends: Friend[] = [
  {
    id: 'james',
    user: 'james',
    name: 'James',
    avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=240',
  },
  {
    id: 'hyunbin',
    user: 'hyunbin',
    name: 'Hyunbin',
    avatar: 'https://images.unsplash.com/photo-1527980965255-d3b416303d12?w=240',
  },
  {
    id: 'dongjun',
    user: 'dongjun',
    name: 'Dongjun',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=240',
  },
  {
    id: 'yuna',
    user: 'yuna',
    name: 'Yuna',
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=240',
  },
  {
    id: 'minji',
    user: 'minji',
    name: 'Minji',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=240',
  },
  {
    id: 'seojun',
    user: 'seojun',
    name: 'Seojun',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=240',
  },
  {
    id: 'hannah',
    user: 'hannah',
    name: 'Hannah',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=240',
  },
  {
    id: 'leo',
    user: 'leo',
    name: 'Leo',
    avatar: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=240',
  },
];

export default function FriendManagementScreen() {
  const insets = useSafeAreaInsets();
  const [searchText, setSearchText] = useState('');
  const normalizedSearch = searchText.trim().toLowerCase();
  const filteredFriends = useMemo(
    () =>
      normalizedSearch
        ? friends.filter(
            (friend) =>
              friend.user.toLowerCase().includes(normalizedSearch) ||
              friend.name.toLowerCase().includes(normalizedSearch),
          )
        : friends,
    [normalizedSearch],
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
        <ScrollView
          style={styles.list}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
        >
          {filteredFriends.map((friend) => (
            <View key={friend.id} style={styles.friendRow}>
              <Image source={{ uri: friend.avatar }} style={styles.friendAvatar} contentFit="cover" />
              <View style={styles.friendInfo}>
                <Text style={styles.friendUser}>@{friend.user}</Text>
                <Text style={styles.friendName}>{friend.name}</Text>
              </View>
            </View>
          ))}
          {filteredFriends.length === 0 ? (
            <Text style={styles.emptyText}>검색 결과가 없습니다.</Text>
          ) : null}
        </ScrollView>
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
  },
});
