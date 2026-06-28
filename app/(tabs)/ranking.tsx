import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Brand } from '@/constants/theme';

type RankingUser = {
  id: string;
  rank: number;
  user: string;
  streak: number;
  score: number;
  avatar: string;
};

const todayMission = '오늘의 미션: 책상 위에서 가장 자주 쓰는 물건을 찍어보세요.';

const rankingUsers: RankingUser[] = [
  {
    id: 'yuna',
    rank: 1,
    user: 'yuna',
    streak: 18,
    score: 18,
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400',
  },
  {
    id: 'james',
    rank: 2,
    user: 'james',
    streak: 14,
    score: 14,
    avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=400',
  },
  {
    id: 'hyunbin',
    rank: 3,
    user: 'hyunbin',
    streak: 11,
    score: 11,
    avatar: 'https://images.unsplash.com/photo-1527980965255-d3b416303d12?w=400',
  },
  {
    id: 'dongjun',
    rank: 4,
    user: 'dongjun',
    streak: 9,
    score: 9,
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400',
  },
  {
    id: 'mina',
    rank: 5,
    user: 'mina',
    streak: 7,
    score: 7,
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400',
  },
  {
    id: 'seo',
    rank: 6,
    user: 'seo',
    streak: 5,
    score: 5,
    avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400',
  },
  {
    id: 'arin',
    rank: 7,
    user: 'arin',
    streak: 4,
    score: 4,
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400',
  },
  {
    id: 'joon',
    rank: 8,
    user: 'joon',
    streak: 3,
    score: 3,
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400',
  },
  {
    id: 'nari',
    rank: 9,
    user: 'nari',
    streak: 2,
    score: 2,
    avatar: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=400',
  },
  {
    id: 'tae',
    rank: 10,
    user: 'tae',
    streak: 1,
    score: 1,
    avatar: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=400',
  },
];

const podiumItems = [rankingUsers[1], rankingUsers[0], rankingUsers[2]];
const listItems = rankingUsers.slice(3);

function formatScore(score: number) {
  return `${score}점`;
}

function PodiumItem({ item }: { item: RankingUser }) {
  const isFirst = item.rank === 1;

  return (
    <View style={[styles.podiumItem, isFirst ? styles.firstPodiumItem : undefined]}>
      <View style={[styles.podiumImageWrap, isFirst ? styles.firstPodiumImageWrap : undefined]}>
        <Image source={{ uri: item.avatar }} style={styles.podiumImage} contentFit="cover" />
        <View style={[styles.rankBadge, isFirst ? styles.firstRankBadge : undefined]}>
          <Text style={styles.rankBadgeText}>{item.rank}</Text>
        </View>
      </View>
      <Text style={styles.podiumName} numberOfLines={1}>
        @{item.user}
      </Text>
      <Text style={styles.podiumOwner}>{item.streak}일 연속</Text>
      <View style={[styles.podiumBlock, isFirst ? styles.firstPodiumBlock : undefined]}>
        <Text style={styles.podiumScore}>{formatScore(item.score)}</Text>
      </View>
    </View>
  );
}

function RankingRow({ item }: { item: RankingUser }) {
  return (
    <View style={styles.rankRow}>
      <Text style={styles.rankNumber}>{item.rank}</Text>
      <Image source={{ uri: item.avatar }} style={styles.rowImage} contentFit="cover" />
      <View style={styles.rowCopy}>
        <Text style={styles.rowName}>@{item.user}</Text>
        <Text style={styles.rowOwner}>{item.streak}일 연속 미션 완료</Text>
      </View>
      <Text style={styles.rowScore}>{formatScore(item.score)}</Text>
    </View>
  );
}

export default function RankingScreen() {
  const insets = useSafeAreaInsets();
  const [showMission, setShowMission] = useState(false);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: insets.top + 18,
          paddingBottom: insets.bottom + 28,
        },
      ]}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>랭킹</Text>
            <Text style={styles.subtitle}>오늘의 미션을 이어간 친구들</Text>
          </View>
          <Pressable
            style={styles.missionButton}
            onPress={() => setShowMission((value) => !value)}
          >
            <Text style={styles.missionButtonText}>!</Text>
          </Pressable>
        </View>
        {showMission ? (
          <View style={styles.missionBubble}>
            <View style={styles.missionBubbleTail} />
            <Text style={styles.missionText}>{todayMission}</Text>
            <Text style={styles.missionRule}>하루 성공하면 +1점, 하루 쉬면 streak는 다시 0점부터 시작해요.</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.podium}>
        {podiumItems.map((item) => (
          <PodiumItem key={item.id} item={item} />
        ))}
      </View>

      <View style={styles.listPanel}>
        {listItems.map((item) => (
          <RankingRow key={item.id} item={item} />
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Brand.secondary,
  },
  content: {
    paddingHorizontal: 18,
    gap: 18,
  },
  header: {
    gap: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerCopy: {
    flex: 1,
    gap: 4,
  },
  title: {
    color: Brand.text,
    fontSize: 30,
    fontWeight: '900',
  },
  subtitle: {
    color: Brand.muted,
    fontSize: 14,
    fontWeight: '700',
  },
  missionButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
    backgroundColor: Brand.surface,
    borderWidth: 1,
    borderColor: Brand.border,
  },
  missionButtonText: {
    color: Brand.text,
    fontSize: 18,
    fontWeight: '900',
  },
  missionBubble: {
    position: 'relative',
    padding: 14,
    borderRadius: 8,
    backgroundColor: Brand.surface,
    borderWidth: 1,
    borderColor: Brand.border,
  },
  missionBubbleTail: {
    position: 'absolute',
    right: 16,
    top: -7,
    width: 14,
    height: 14,
    backgroundColor: Brand.surface,
    borderLeftWidth: 1,
    borderTopWidth: 1,
    borderColor: Brand.border,
    transform: [{ rotate: '45deg' }],
  },
  missionText: {
    color: Brand.text,
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 21,
  },
  missionRule: {
    marginTop: 6,
    color: Brand.muted,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  podium: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    minHeight: 290,
    paddingHorizontal: 2,
  },
  podiumItem: {
    width: '31%',
    alignItems: 'center',
    gap: 7,
  },
  firstPodiumItem: {
    paddingBottom: 18,
  },
  podiumImageWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    padding: 4,
    backgroundColor: Brand.surface,
    borderWidth: 2,
    borderColor: Brand.border,
  },
  firstPodiumImageWrap: {
    width: 112,
    height: 112,
    borderRadius: 56,
    borderColor: Brand.primary,
  },
  podiumImage: {
    width: '100%',
    height: '100%',
    borderRadius: 999,
  },
  rankBadge: {
    position: 'absolute',
    right: -3,
    top: -5,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Brand.lavender,
    borderWidth: 2,
    borderColor: Brand.surface,
  },
  firstRankBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  rankBadgeText: {
    color: Brand.text,
    fontSize: 14,
    fontWeight: '900',
  },
  podiumName: {
    color: Brand.text,
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
  },
  podiumOwner: {
    color: Brand.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  podiumBlock: {
    width: '100%',
    height: 92,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Brand.surface,
    borderColor: Brand.border,
    borderRadius: 8,
    borderWidth: 1,
  },
  firstPodiumBlock: {
    height: 122,
    borderColor: Brand.primary,
  },
  podiumScore: {
    color: Brand.text,
    fontSize: 13,
    fontWeight: '900',
  },
  listPanel: {
    backgroundColor: Brand.surface,
    borderColor: Brand.border,
    borderRadius: 8,
    borderWidth: 1,
    paddingVertical: 6,
  },
  rankRow: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  rankNumber: {
    width: 26,
    color: Brand.muted,
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
  },
  rowImage: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: Brand.secondary,
  },
  rowCopy: {
    flex: 1,
    gap: 3,
  },
  rowName: {
    color: Brand.text,
    fontSize: 15,
    fontWeight: '900',
  },
  rowOwner: {
    color: Brand.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  rowScore: {
    color: Brand.text,
    fontSize: 15,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
});
